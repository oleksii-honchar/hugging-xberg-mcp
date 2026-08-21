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
import { extractBytes as xbergExtractBytes, extractStructured as xbergExtractStructured } from './xberg-client.js';

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
        '{"chunking": {"max_characters": 2000}}, or {"force_ocr_pages": [1, 2]}.',
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
        'Use to extract forms, invoices, receipts, or tabular data from documents.',
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
      }),
    },
    handleExtractStructured,
  );
}

/**
 * Handler for extract_bytes.
 * Thin wrapper — delegates to XbergClient.extractBytes().
 */
async function handleExtractBytes(args) {
  try {
    logInfo(`extract_bytes invoked data=${truncateBase64(args.data)} mime_type=${args.mime_type ?? 'unset'} config=${args.config ? 'present' : 'absent'} response_format=${args.response_format ?? 'unset'}`);

    const result = await xbergExtractBytes(args);

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
    logInfo(`extract_structured invoked data=${truncateBase64(args.data)}`);

    const result = await xbergExtractStructured(args.data);

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
