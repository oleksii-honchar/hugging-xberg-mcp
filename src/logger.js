#!/usr/bin/env node
/**
 * Structured logger — info + debug levels, base64 truncation, API key masking.
 * All logs to stderr (stdout reserved for HTTP responses in Docker).
 */

import { config } from './config.js';

const IS_DEBUG = config.logLevel === 'debug';

/** Format a log entry as JSON and write to stderr. */
function emit(level, message) {
  console.error(JSON.stringify({ level, ts: new Date().toISOString(), msg: message }));
}

/** Log at info level — always emitted. */
export function logInfo(message) {
  emit('info', message);
}

/** Log at debug level — only when LOG_LEVEL=debug. */
export function logDebug(message) {
  if (!IS_DEBUG) return;
  emit('debug', message);
}

/** Truncate base64 data to first `maxLen` chars + total length indicator. */
export function truncateBase64(data, maxLen = 80) {
  if (!data || typeof data !== 'string') return String(data);
  return data.length > maxLen
    ? `${data.slice(0, maxLen)}… [${data.length} chars total]`
    : data;
}

/** Mask API key — show presence/absence only, never the actual value. */
export function maskApiKey(value) {
  return value ? 'present' : 'absent';
}
