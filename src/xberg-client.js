#!/usr/bin/env node
/**
 * Xberg API client — adapter layer for all HTTP calls to Xberg.
 *
 * Encapsulates fetch, FormData construction, and error handling.
 * Returns a Result-like object: { ok: true, body } or { ok: false, status, error }.
 */

import { config } from './config.js';
import { logDebug, logInfo } from './logger.js';

/**
 * Maximum base64 character length before rejecting.
 * ~48.9MB base64 chars (~36.5MB raw), below the 50mb express.json limit
 * with a ~1.5MB safety margin for the JSON envelope.
 */
const MAX_BASE64_LENGTH = 48_900_000;

/**
 * Validate and extract base64 data from input.
 * Throws with specific error messages for invalid formats.
 */
export function extractBase64(input) {
  if (!input || typeof input !== 'string') {
    throw new Error(
      'Missing data parameter. Expected file data in one of these formats:\n' +
      '- Attachment URI: opencode://attachment/<uuid>\n' +
      '- Data URL: data:image/png;base64,...\n' +
      '- Raw base64 string',
    );
  }

  // Check for HTTP URLs (common mistake)
  if (input.startsWith('http://') || input.startsWith('https://')) {
    throw new Error(
      'HTTP URLs are not supported.\n' +
      'Use one of these instead:\n' +
      '- Attachment URI: opencode://attachment/<uuid> (for attached files)\n' +
      '- Data URL: data:image/png;base64,...\n' +
      '- Raw base64 string',
    );
  }

  // Pass through opencode://attachment/ URIs (resolved server-side by opencode;
  // size unknown at this point, Xberg will reject if too large)
  if (input.startsWith('opencode://')) {
    return input;
  }

  // Extract base64 from data URL
  const dataUrlMatch = input.match(/^data:[^,]+,(.+)$/);
  const base64Data = dataUrlMatch ? dataUrlMatch[1] : input;

  // Validate base64 size
  if (base64Data.length > MAX_BASE64_LENGTH) {
    throw new Error(
      `Base64 data exceeds size limit (${base64Data.length} chars, max ${MAX_BASE64_LENGTH}).\n` +
      'If using chrome-devtools, take_screenshot supports a "resize" option to downscale.',
    );
  }

  return base64Data;
}

/**
 * Decode base64/data-url to a Buffer.
 */
export function decodeToBuffer(input) {
  const base64Data = extractBase64(input);
  return Buffer.from(base64Data, 'base64');
}

/**
 * POST /extract — extract bytes from a file.
 *
 * @param {object} args
 * @param {string} args.data - Base64-encoded file data or full data URL.
 * @param {string} [args.mime_type] - Optional MIME type hint.
 * @param {Record<string, unknown>} [args.config] - Optional extraction config override.
 * @param {'json'|'toon'|'plain'|'markdown'|'djot'|'html'} [args.response_format] - Optional response format.
 * @returns {Promise<{ ok: boolean, body?: unknown, status?: number, error?: string }>}
 */
export async function extractBytes(args) {
  const buffer = decodeToBuffer(args.data);

  const formData = new FormData();
  formData.append(
    'files',
    new File([buffer], 'file', { type: args.mime_type || 'application/octet-stream' }),
  );

  if (args.config !== undefined) {
    formData.append('config', JSON.stringify(args.config));
  }
  appendResponseFormat(formData, args.response_format);

  logDebug(`xberg POST /extract file_size=${buffer.length}`);

  const url = `${config.xbergUrl}/extract`;
  const response = await fetch(url, { method: 'POST', body: formData });

  return handleXbergResponse(response, 'extract');
}

/**
 * Map the wrapper response_format onto xberg multipart fields:
 * - 'toon' → format=toon (toon rendering)
 * - 'json' → omit format fields (default JSON envelope)
 * - 'plain' | 'markdown' | 'djot' | 'html' → output_format=<value> (content rendering)
 */
function appendResponseFormat(formData, responseFormat) {
  if (!responseFormat || responseFormat === 'json') return;

  if (responseFormat === 'toon') {
    formData.append('format', 'toon');
    return;
  }

  formData.append('output_format', responseFormat);
}

/**
 * Build the structured_extraction config object for xberg's /extract config JSON.
 * Maps the config module fields onto xberg's StructuredExtractionConfig shape.
 *
 * @returns {Record<string, unknown>} structured_extraction config object.
 */
export function buildStructuredConfig() {
  const structuredExtraction = {
    schema: JSON.parse(config.structuredSchema),
    schema_name: config.structuredSchemaName,
    strict: config.structuredStrict,
  };

  if (config.structuredSchemaDescription !== null) {
    structuredExtraction.schema_description = String(config.structuredSchemaDescription);
  }
  if (config.structuredPrompt !== null) {
    structuredExtraction.prompt = String(config.structuredPrompt);
  }

  if (config.structuredApiKey !== null || config.structuredModel !== null || config.structuredBaseUrl !== null) {
    const llm = {};
    if (config.structuredModel !== null) llm.model = String(config.structuredModel);
    if (config.structuredBaseUrl !== null) llm.base_url = String(config.structuredBaseUrl);
    if (config.structuredApiKey !== null) llm.api_key = String(config.structuredApiKey);
    structuredExtraction.llm = llm;
  }

  return { structured_extraction: structuredExtraction };
}

/**
 * Build the OCR config block for xberg's /extract config JSON.
 *
 * xberg REPLACES (not merges) the per-request OCR config over xberg.toml
 * defaults, so the returned block is always complete for the chosen engine.
 *
 * @param {string|undefined} ocrEngine - 'auto' | 'tesseract' | 'paddleocr' | 'vlm' (or undefined).
 * @returns {Record<string, unknown>|null} OCR config block, or null when the
 *   agent leaves the decision to the server default (undefined, 'auto', unknown).
 * @throws {Error} when 'vlm' is selected but XBERG_VLM_OCR_MODEL is not configured.
 */
export function buildOcrConfig(ocrEngine) {
  if (ocrEngine === undefined || ocrEngine === 'auto') {
    return null;
  }

  if (ocrEngine === 'tesseract') {
    return { backend: 'tesseract', vlm_fallback: { mode: 'disabled' } };
  }

  if (ocrEngine === 'paddleocr') {
    return { backend: 'paddleocr', vlm_fallback: { mode: 'disabled' } };
  }

  if (ocrEngine === 'vlm') {
    if (config.vlmOcrModel === null || config.vlmOcrModel === '') {
      throw new Error("ocr_engine 'vlm' requires XBERG_VLM_OCR_MODEL to be set on the wrapper");
    }
    const vlmConfig = {
      model: String(config.vlmOcrModel),
    };
    if (config.structuredBaseUrl !== null) {
      vlmConfig.base_url = String(config.structuredBaseUrl);
    }
    if (config.structuredApiKey !== null) {
      vlmConfig.api_key = String(config.structuredApiKey);
    }
    return { backend: 'vlm', vlm_fallback: { mode: 'disabled' }, vlm_config: vlmConfig };
  }

  // Unknown engine value — defensive: let the server default apply.
  return null;
}

/**
 * POST /extract — extract structured data from a file.
 * Structured extraction is driven through the /extract config JSON
 * (config.structured_extraction); there is no /extract-structured endpoint.
 *
 * xberg REPLACES the per-request OCR config over its defaults, so when an OCR
 * engine is requested the returned block is injected complete (never merged
 * with server defaults). 'auto' and undefined leave the decision to the server.
 *
 * @param {string} data - Base64-encoded file data or full data URL.
 * @param {'auto'|'tesseract'|'paddleocr'|'vlm'} [ocrEngine] - Optional OCR engine override.
 * @returns {Promise<{ ok: boolean, body?: unknown, status?: number, error?: string }>}
 * @throws {Error} when ocrEngine is 'vlm' but XBERG_VLM_OCR_MODEL is not configured.
 */
export async function extractStructured(data, ocrEngine) {
  const buffer = decodeToBuffer(data);

  let extractConfig = buildStructuredConfig();
  if (ocrEngine && ocrEngine !== 'auto' && !('ocr' in extractConfig)) {
    const ocrBlock = buildOcrConfig(ocrEngine);
    if (ocrBlock !== null) {
      extractConfig = { ...extractConfig, ocr: ocrBlock };
    }
  }

  const formData = new FormData();
  formData.append('files', new File([buffer], 'file', { type: 'application/octet-stream' }));
  formData.append('config', JSON.stringify(extractConfig));

  logDebug(`xberg POST /extract file_size=${buffer.length}`);

  const url = `${config.xbergUrl}/extract`;
  const response = await fetch(url, { method: 'POST', body: formData });

  return handleXbergResponse(response, 'extract');
}

/**
 * Handle an Xberg API response — parse JSON on success, extract error text on failure.
 */
async function handleXbergResponse(response, endpoint) {
  if (!response.ok) {
    const errorText = await response.text();
    logInfo(`xberg ${endpoint} error status=${response.status} body=${errorText.slice(0, 200)}`);
    return { ok: false, status: response.status, error: `Xberg error (${response.status}): ${errorText}` };
  }

  const body = await response.json();
  logDebug(`xberg ${endpoint} responded status=${response.status}`);
  return { ok: true, body };
}
