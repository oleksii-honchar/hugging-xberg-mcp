import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { registerTools } from './tools.js';
import { TOOLS } from './config.js';

/** Expected response_format enum — extended for xberg output_format rendering. */
const EXPECTED_RESPONSE_FORMATS = ['json', 'toon', 'plain', 'markdown', 'djot', 'html'];

/**
 * Mock McpServer that captures tool definitions instead of talking to the SDK.
 */
function createMockMcpServer() {
  const tools = new Map();
  return {
    tools,
    registerTool(name, definition) {
      tools.set(name, definition);
    },
  };
}

function registerAndGetDefinition(toolName) {
  const server = createMockMcpServer();
  registerTools(server);
  const definition = server.tools.get(toolName);
  assert.ok(definition, `tool ${toolName} must be registered`);
  return definition;
}

describe('tools.js registration', () => {
  it('registers extract_bytes', () => {
    const server = createMockMcpServer();
    registerTools(server);
    assert.ok(server.tools.has(TOOLS.EXTRACT_BYTES), 'extract_bytes must be registered');
  });

  it('registers extract_structured', () => {
    const server = createMockMcpServer();
    registerTools(server);
    assert.ok(server.tools.has(TOOLS.EXTRACT_STRUCTURED), 'extract_structured must be registered');
  });
});

describe('tools.js extract_bytes schema', () => {
  const definition = registerAndGetDefinition(TOOLS.EXTRACT_BYTES);
  const shape = definition.inputSchema.shape;

  it('response_format enum equals json,toon,plain,markdown,djot,html', () => {
    const enumSchema = shape.response_format.unwrap();
    assert.deepEqual(enumSchema.options, EXPECTED_RESPONSE_FORMATS);
  });

  it('accepts every response_format enum value', () => {
    const enumSchema = shape.response_format.unwrap();
    for (const value of EXPECTED_RESPONSE_FORMATS) {
      assert.equal(
        enumSchema.safeParse(value).success,
        true,
        `response_format '${value}' must be accepted`,
      );
    }
  });

  it('rejects unknown response_format values', () => {
    const enumSchema = shape.response_format.unwrap();
    assert.equal(enumSchema.safeParse('xml').success, false, "'xml' must be rejected");
  });

  it('config field uses z.record(z.unknown()) — value type unknown, not any', () => {
    const configSchema = shape.config.unwrap();
    const valueType = configSchema._def.valueType;
    assert.ok(
      valueType instanceof z.ZodUnknown,
      'config record value type must be ZodUnknown (z.record(z.unknown()))',
    );
    assert.ok(
      !(valueType instanceof z.ZodAny),
      'config record value type must NOT be ZodAny (zero any)',
    );
  });

  it('config field accepts arbitrary extraction config JSON', () => {
    const configSchema = shape.config.unwrap();
    const parsed = configSchema.safeParse({
      pages: { insert_page_markers: true },
      chunking: { max_characters: 2000, overlap: 200 },
      force_ocr_pages: [1, 2],
    });
    assert.equal(parsed.success, true, 'PDF-relevant config object must parse');
  });

  it('description mentions PDFs/documents', () => {
    assert.match(definition.description, /PDF/i, 'description must mention PDFs');
    assert.match(definition.description, /document/i, 'description must mention documents');
  });

  it('description mentions the xberg {results, errors, summary} response shape', () => {
    assert.match(
      definition.description,
      /\{results,\s*errors,\s*summary\}/,
      'description must describe the xberg response shape',
    );
  });

  it('description documents PDF-relevant config keys', () => {
    assert.match(
      definition.description,
      /pages\.insert_page_markers/,
      'description must document pages.insert_page_markers (verified upstream key)',
    );
    assert.match(
      definition.description,
      /chunking/,
      'description must document chunking',
    );
    assert.match(
      definition.description,
      /force_ocr_pages/,
      'description must document force_ocr_pages',
    );
  });

  it('description does NOT promise input-side page-range extraction (ADR-007)', () => {
    assert.doesNotMatch(
      definition.description,
      /start_page|end_page|page[_ ]range/i,
      'description must not promise page-range extraction',
    );
  });
});

describe('tools.js extract_structured description', () => {
  const definition = registerAndGetDefinition(TOOLS.EXTRACT_STRUCTURED);

  it('notes config-driven implementation on /extract', () => {
    assert.match(
      definition.description,
      /\/extract/,
      'description must reference the /extract endpoint',
    );
    assert.match(
      definition.description,
      /config/i,
      'description must note config-driven implementation',
    );
  });
});

describe('tools.js zero-any source contract', () => {
  it('tools.js source contains no z.any()', () => {
    const toolsPath = path.resolve(import.meta.dirname, 'tools.js');
    const source = fs.readFileSync(toolsPath, 'utf-8');
    assert.doesNotMatch(source, /z\.any\(\)/, 'tools.js must not use z.any()');
  });
});
