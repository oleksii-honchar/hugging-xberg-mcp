#!/usr/bin/env node
/**
 * MCP tool definitions.
 *
 * Each tool is a thin handler that validates input, delegates to XbergClient,
 * and formats the response. Business logic lives in xberg-client.js.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TOOLS } from './config.js';
import { logInfo, truncateBase64 } from './logger.js';
import {
  buildOcrConfig,
  extractBytes as xbergExtractBytes,
  extractStructured as xbergExtractStructured,
} from './xberg-client.js';

/** OCR engines the wrapper can explicitly request, overriding the server default. */
const OCR_ENGINE_OPTIONS = ['auto', 'tesseract', 'paddleocr', 'vlm'];

/**
 * Register all tools on an McpServer instance.
 */
export function registerTools(mcpServer) {
  mcpServer.registerTool(
    TOOLS.EXTRACT_BYTES,
    {
      title: 'Extract Bytes',
      description:
        'OCR: Read and extract text from images, PDFs, and other documents. ' +
        'Accepts file data as opencode://attachment/ URI, data URL, or base64 string. ' +
        'Returns extracted text, tables, and document structure. ' +
        'Use to extract text from screenshots, photos, PDFs, scanned documents, or any image. ' +
        'Xberg responses use the {results, errors, summary} envelope. ' +
        'For large PDFs, pass pagination config keys such as pages.insert_page_markers, ' +
        'chunking, or force_ocr_pages, e.g. {"pages": {"insert_page_markers": true}}, ' +
        '{"chunking": {"max_characters": 2000}}, or {"force_ocr_pages": [1, 2]}. ' +
        'If the default request times out on scanned or image-only pages, pass ' +
        'disable_ocr: true to skip OCR (VLM) and return the native text layer faster — no LLM call. ' +
        'OCR is CPU-first (tesseract) by default on the server; pass ocr_engine to pin ' +
        "the engine explicitly ('tesseract', 'paddleocr', or 'vlm') instead of the default.",
      inputSchema: z.object({
        data: z.string().describe(
          'File data to extract text from. Accepts one of these formats:\n' +
          '1. Attachment URI (recommended for attached files):\n' +
          '   opencode://attachment/d4b96841-f2f1-4b15-ba48-8bb4aeaa788d.png\n' +
          '2. Data URL:\n' +
          '   data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...\n' +
          '3. Raw base64 string:\n' +
          '   iVBORw0KGgoAAAANSUhEUgAA...\n' +
          'Note: HTTP URLs (https://...) are NOT supported.'
        ),
        mime_type: z.string().optional().describe('Optional MIME type hint for the file'),
        config: z.record(z.unknown()).optional().describe('Optional extraction config override as JSON'),
        disable_ocr: z.boolean().optional().describe(
          'Skip OCR (VLM) on scanned/image-only pages — returns only the native text layer. ' +
          'Faster, no LLM call. Use when the default request times out.'
        ),
        ocr_engine: z.enum(OCR_ENGINE_OPTIONS).optional().describe(
          "OCR engine override: 'auto' (server default, CPU-first tesseract), " +
          "'tesseract', 'paddleocr', or 'vlm' (requires XBERG_VLM_OCR_MODEL on the wrapper). " +
          "Ignored when disable_ocr is true or when config.ocr is supplied explicitly."
        ),
        response_format: z
          .enum(['json', 'toon', 'plain', 'markdown', 'djot', 'html'])
          .optional()
          .describe("Optional response format: 'json' (default envelope), 'toon', or 'plain'/'markdown'/'djot'/'html' content rendering"),
      }),
    },
    handleExtractBytes,
  );

  mcpServer.registerTool(
    TOOLS.EXTRACT_STRUCTURED,
    {
      title: 'Extract Structured',
      description:
        'OCR: Extract structured data from images, PDFs, and other documents into predefined schemas. ' +
        'Accepts file data as opencode://attachment/ URI, data URL, or base64 string. ' +
        'Returns structured data matching server-configured schema. ' +
        'Implemented via xberg config-driven structured extraction on /extract. ' +
        'Use to extract forms, invoices, receipts, or tabular data from documents. ' +
        "OCR is CPU-first (tesseract) by default on the server; pass ocr_engine to pin " +
        "the OCR engine explicitly ('tesseract', 'paddleocr', or 'vlm').",
      inputSchema: z.object({
        data: z.string().describe(
          'File data to extract structured data from. Accepts one of these formats:\n' +
          '1. Attachment URI (recommended for attached files):\n' +
          '   opencode://attachment/d4b96841-f2f1-4b15-ba48-8bb4aeaa788d.png\n' +
          '2. Data URL:\n' +
          '   data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...\n' +
          '3. Raw base64 string:\n' +
          '   iVBORw0KGgoAAAANSUhEUgAA...\n' +
          'Note: HTTP URLs (https://...) are NOT supported.'
        ),
        ocr_engine: z.enum(OCR_ENGINE_OPTIONS).optional().describe(
          "OCR engine override for the extract step: 'auto' (server default, CPU-first " +
          "tesseract), 'tesseract', 'paddleocr', or 'vlm' (requires XBERG_VLM_OCR_MODEL " +
          'on the wrapper).'
        ),
      }),
    },
    handleExtractStructured,
  );
}

/**
 * Resolve the final xberg config for extract_bytes from agent-supplied knobs.
 *
 * Precedence (highest first):
 *  1. disable_ocr: true wins — OCR is skipped entirely; ocr_engine is ignored.
 *  2. User-supplied config.ocr wins — passed through verbatim, unvalidated
 *     (the user knows the xberg config surface better than the wrapper).
 *  3. ocr_engine (['tesseract', 'paddleocr', 'vlm']) — injected as a complete
 *     OCR block built from wrapper config; 'auto' and undefined leave the
 *     decision to the server default (CPU-first tesseract).
 *  4. Otherwise the config passes through unchanged.
 *
 * @param {object} args - extract_bytes tool args.
 * @param {Record<string, unknown>} [args.config] - User config override.
 * @param {boolean} [args.disable_ocr] - Skip OCR entirely.
 * @param {'auto'|'tesseract'|'paddleocr'|'vlm'} [args.ocr_engine] - OCR engine override.
 * @returns {Record<string, unknown>|undefined} Final config for the /extract call.
 * @throws {Error} when ocr_engine is 'vlm' but XBERG_VLM_OCR_MODEL is not configured.
 */
export function resolveExtractBytesConfig(args) {
  if (args.disable_ocr) {
    return { ...(args.config ?? {}), disable_ocr: true };
  }

  const userConfig = args.config ?? {};
  if (
    (args.ocr_engine === 'tesseract' || args.ocr_engine === 'paddleocr' || args.ocr_engine === 'vlm') &&
    !('ocr' in userConfig)
  ) {
    return { ...userConfig, ocr: buildOcrConfig(args.ocr_engine) };
  }

  return args.config;
}

/**
 * Handler for extract_bytes.
 * Thin wrapper — delegates to XbergClient.extractBytes().
 */
async function handleExtractBytes(args) {
  try {
    logInfo(`extract_bytes invoked data=${truncateBase64(args.data)} mime_type=${args.mime_type ?? 'unset'} config=${args.config ? 'present' : 'absent'} ocr_engine=${args.ocr_engine ?? 'unset'} response_format=${args.response_format ?? 'unset'}`);

    const config = resolveExtractBytesConfig(args);
    const result = await xbergExtractBytes({ ...args, config });

    if (!result.ok) {
      return { content: [{ type: 'text', text: result.error }], isError: true };
    }

    return { content: [{ type: 'text', text: JSON.stringify(result.body) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logInfo(`extract_bytes error ${msg}`);
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
}

/**
 * Handler for extract_structured.
 * Thin wrapper — delegates to XbergClient.extractStructured().
 */
async function handleExtractStructured(args) {
  try {
    logInfo(`extract_structured invoked data=${truncateBase64(args.data)} ocr_engine=${args.ocr_engine ?? 'unset'}`);

    const result = await xbergExtractStructured(args.data, args.ocr_engine);

    if (!result.ok) {
      return { content: [{ type: 'text', text: result.error }], isError: true };
    }

    return { content: [{ type: 'text', text: JSON.stringify(result.body) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logInfo(`extract_structured error ${msg}`);
    return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
  }
}
