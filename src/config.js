#!/usr/bin/env node
/**
 * Configuration for hugging-xberg-mcp.
 * All environment variables loaded once at startup into a single object.
 * No process.env access outside this module.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load structured extraction schema from file.
 */
function loadStructuredSchema() {
  const schemaPath = join(__dirname, 'structured-schema.json');
  return readFileSync(schemaPath, 'utf-8');
}

/**
 * Application configuration — all env vars loaded once at startup.
 */
export const config = {
  xbergUrl: process.env.XBERG_API_URL || 'http://xberg:8000',
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  mcpPort: parseInt(process.env.MCP_PORT || '3000', 10),
  structuredSchema: loadStructuredSchema(),
  structuredSchemaName: process.env.HUGGING_XBERG_STRUCTURED_SCHEMA_NAME || 'extraction',
  structuredSchemaDescription: process.env.HUGGING_XBERG_STRUCTURED_SCHEMA_DESCRIPTION ?? null,
  structuredPrompt: process.env.HUGGING_XBERG_STRUCTURED_PROMPT ?? null,
  structuredStrict: process.env.HUGGING_XBERG_STRUCTURED_STRICT === 'true',
  structuredApiKey: process.env.LITELLM_API_KEY ?? null,
  structuredModel: process.env.XBERG_LLM_MODEL ?? null,
  structuredBaseUrl: process.env.XBERG_LLM_BASE_URL ?? null,
  vlmOcrModel: process.env.XBERG_VLM_OCR_MODEL ?? null,
};

/** Tool names — single source of truth. */
export const TOOLS = Object.freeze({
  EXTRACT_BYTES: 'extract_bytes',
  EXTRACT_STRUCTURED: 'extract_structured',
});

/** Xberg API endpoints. */
export const ENDPOINTS = Object.freeze({
  EXTRACT: '/extract',
});
