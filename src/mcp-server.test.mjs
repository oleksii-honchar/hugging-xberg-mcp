import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const mcpServerPath = path.resolve(import.meta.dirname, 'mcp-server.mjs');
const source = fs.readFileSync(mcpServerPath, 'utf-8');

describe('mcp-server identity', () => {
  it('names the McpServer hugging-xberg-mcp', () => {
    assert.match(
      source,
      /name:\s*'hugging-xberg-mcp'/,
      'McpServer name must be hugging-xberg-mcp',
    );
  });

  it('versions the McpServer 2.0.0', () => {
    assert.match(
      source,
      /version:\s*'2\.0\.0'/,
      'McpServer version must be 2.0.0',
    );
  });

  it('instructions describe the xberg backend', () => {
    assert.match(
      source,
      /instructions:/,
      'McpServer must carry instructions',
    );
    assert.match(
      source,
      /instructions:[\s\S]*?Xberg/,
      'instructions must reference the Xberg backend',
    );
  });

  it('instructions mention the {results, errors, summary} response shape', () => {
    assert.match(
      source,
      /\{results,\s*errors,\s*summary\}/,
      'instructions must describe the xberg {results, errors, summary} response shape',
    );
  });

  it('keeps stateless per-request sessionIdGenerator undefined', () => {
    assert.match(
      source,
      /sessionIdGenerator:\s*undefined/,
      'stateless mode requires sessionIdGenerator: undefined',
    );
  });

  it('keeps GET /mcp returning 405', () => {
    assert.match(
      source,
      /app\.get\('\/mcp'[\s\S]*?405/,
      'GET /mcp must return 405 in stateless mode',
    );
  });

  it('keeps DELETE /mcp returning 405', () => {
    assert.match(
      source,
      /app\.delete\('\/mcp'[\s\S]*?405/,
      'DELETE /mcp must return 405 in stateless mode',
    );
  });

  it('keeps unhandledRejection handler', () => {
    assert.match(
      source,
      /process\.on\('unhandledRejection'/,
      'unhandledRejection handler must be preserved',
    );
  });

  it('keeps SIGINT graceful shutdown handler', () => {
    assert.match(
      source,
      /process\.on\('SIGINT'/,
      'SIGINT handler must be preserved',
    );
  });
});

describe('mcp-server express.json body limit', () => {

  it('uses env-configurable MCP_BODY_LIMIT with 50mb default', () => {
    assert.match(
      source,
      /express\.json\(\s*{\s*limit:\s*process\.env\.MCP_BODY_LIMIT\s*\|\|\s*'50mb'\s*}\s*\)/,
      'express.json must use limit: process.env.MCP_BODY_LIMIT || \'50mb\'',
    );
  });

  it('has exactly one express.json call', () => {
    const matches = source.match(/express\.json\(/g);
    assert.equal(matches?.length, 1, 'should have exactly one express.json call');
  });
});

describe('mcp-server express error handler', () => {
  it('reads err.status with 500 default', () => {
    assert.match(
      source,
      /err\.status\s*\|\|\s*500/,
      'error handler must read err.status with 500 default',
    );
  });

  it('checks for 413 status to return -32600', () => {
    assert.match(
      source,
      /status === 413/,
      'error handler must check for 413 status',
    );
  });

  it('includes JSON-RPC code -32600 for 413 errors', () => {
    assert.match(
      source,
      /-32600/,
      'error handler must include JSON-RPC code -32600 for 413',
    );
  });

  it('includes JSON-RPC code -32603 for other errors', () => {
    assert.match(
      source,
      /-32603/,
      'error handler must include JSON-RPC code -32603 for other errors',
    );
  });

  it('includes 413 user-friendly message referencing the new 50MB limit', () => {
    assert.match(
      source,
      /Payload too large.*under 50MB/,
      'error handler must include 413 message referencing the 50MB limit',
    );
  });

  it('no stale 15MB wording remains in the 413 message', () => {
    assert.doesNotMatch(
      source,
      /15MB/,
      '413 message must not retain stale 15MB wording',
    );
  });

  it('includes 500 fallback message', () => {
    assert.match(
      source,
      /Internal server error.*err\.message/,
      'error handler must include 500 fallback message with err.message',
    );
  });

  it('preserves headersSent guard', () => {
    assert.match(
      source,
      /!res\.headersSent/,
      'error handler must preserve headersSent guard',
    );
  });

  it('preserves logInfo call with err.message', () => {
    assert.match(
      source,
      /logInfo.*err\.message/,
      'error handler must call logInfo with err.message',
    );
  });

  it('preserves jsonrpc 2.0 envelope', () => {
    assert.match(
      source,
      /jsonrpc:\s*'2\.0'/,
      'error handler must include jsonrpc 2.0 envelope',
    );
  });

  it('preserves id null envelope', () => {
    assert.match(
      source,
      /id:\s*null/,
      'error handler must include id null envelope',
    );
  });

  it('uses res.status(status) with dynamic status variable', () => {
    assert.match(
      source,
      /res\.status\(status\)/,
      'error handler must use dynamic status variable from err.status',
    );
  });
});
