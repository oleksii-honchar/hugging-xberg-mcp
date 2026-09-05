import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { registerTools, resolveExtractBytesConfig } from './tools.js';
import { config, TOOLS } from './config.js';

/** Expected response_format enum — extended for xberg output_format rendering. */
const EXPECTED_RESPONSE_FORMATS = ['json', 'toon', 'plain', 'markdown', 'djot', 'html'];

/**
 * Mock McpServer that captures tool definitions (and the handler) instead of
 * talking to the SDK.
 */
function createMockMcpServer() {
  const tools = new Map();
  return {
    tools,
    registerTool(name, definition, handler) {
      if (handler) definition.handler = handler;
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

  it('exposes disable_ocr as an optional boolean', () => {
    const schema = shape.disable_ocr;
    assert.ok(schema instanceof z.ZodOptional, 'disable_ocr must be optional');
    assert.ok(schema.unwrap() instanceof z.ZodBoolean, 'disable_ocr must be a boolean');
    assert.equal(schema.safeParse(true).success, true, 'true must be accepted');
    assert.equal(schema.safeParse(false).success, true, 'false must be accepted');
    assert.equal(schema.safeParse(undefined).success, true, 'undefined must be accepted (optional)');
    assert.equal(schema.safeParse('yes').success, false, 'non-boolean must be rejected');
  });

  it('exposes ocr_engine as an optional enum auto|tesseract|paddleocr|vlm', () => {
    const schema = shape.ocr_engine;
    assert.ok(schema instanceof z.ZodOptional, 'ocr_engine must be optional');
    const enumSchema = schema.unwrap();
    assert.ok(enumSchema instanceof z.ZodEnum, 'ocr_engine must be an enum');
    assert.deepEqual(enumSchema.options, ['auto', 'tesseract', 'paddleocr', 'vlm']);
  });

  it('accepts every ocr_engine enum value and rejects others', () => {
    const enumSchema = shape.ocr_engine.unwrap();
    for (const value of ['auto', 'tesseract', 'paddleocr', 'vlm']) {
      assert.equal(enumSchema.safeParse(value).success, true, `'${value}' must be accepted`);
    }
    assert.equal(enumSchema.safeParse('aws_textract').success, false, 'unknown engine must be rejected');
    assert.equal(shape.ocr_engine.safeParse(undefined).success, true, 'ocr_engine must be optional');
  });

  it('description mentions ocr_engine and the CPU-first default', () => {
    assert.match(definition.description, /ocr_engine/, 'description must mention ocr_engine');
    assert.match(
      definition.description,
      /cpu[- ]first|tesseract/i,
      'description must surface the CPU-first default engine',
    );
  });

  it('description mentions disable_ocr for timeout recovery', () => {
    assert.match(
      definition.description,
      /disable_ocr/,
      'description must mention disable_ocr',
    );
    assert.match(
      definition.description,
      /times?\s*out/i,
      'description must mention timeout recovery',
    );
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

  it('does NOT expose disable_ocr (structured extraction is inherently LLM-based)', () => {
    assert.equal(
      definition.inputSchema.shape.disable_ocr,
      undefined,
      'extract_structured must not expose disable_ocr',
    );
  });

  it('exposes ocr_engine as the same enum as extract_bytes', () => {
    const enumSchema = definition.inputSchema.shape.ocr_engine.unwrap();
    assert.ok(enumSchema instanceof z.ZodEnum, 'ocr_engine must be an enum');
    assert.deepEqual(enumSchema.options, ['auto', 'tesseract', 'paddleocr', 'vlm']);
  });

  it('description mentions ocr_engine', () => {
    assert.match(
      definition.description,
      /ocr_engine/,
      'extract_structured description must mention ocr_engine',
    );
  });
});

describe('tools.js handleExtractBytes disable_ocr forwarding', () => {
  /** Capture the registered handler and return it for direct invocation. */
  function registerHandler() {
    const server = createMockMcpServer();
    registerTools(server);
    const definition = server.tools.get(TOOLS.EXTRACT_BYTES);
    assert.ok(definition.handler, 'extract_bytes handler must be captured by the mock server');
    return definition.handler;
  }

  /** Mock global fetch, capturing the outgoing FormData body. */
  function mockFetchReturningOk(t) {
    let seenForm;
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      seenForm = init.body;
      return new Response(JSON.stringify({ results: [], summary: 'ok' }), { status: 200 });
    });
    return () => seenForm;
  }

  const TINY_B64 = Buffer.from('hello').toString('base64');

  it('merges { disable_ocr: true } into config, preserving existing keys', async (t) => {
    const getForm = mockFetchReturningOk(t);
    const handler = registerHandler();

    const result = await handler({
      data: TINY_B64,
      mime_type: 'application/pdf',
      config: { pages: { insert_page_markers: true } },
      disable_ocr: true,
    });

    assert.equal(result.isError, undefined, 'handler must succeed');
    const config = JSON.parse(getForm().get('config'));
    assert.equal(config.disable_ocr, true, 'disable_ocr must be merged into config');
    assert.deepEqual(
      config.pages,
      { insert_page_markers: true },
      'user-supplied config keys must be preserved',
    );
  });

  it('adds config { disable_ocr: true } when no config was supplied', async (t) => {
    const getForm = mockFetchReturningOk(t);
    const handler = registerHandler();

    await handler({ data: TINY_B64, mime_type: 'application/pdf', disable_ocr: true });

    assert.deepEqual(
      JSON.parse(getForm().get('config')),
      { disable_ocr: true },
      'disable_ocr:true alone must produce the config field',
    );
  });

  it('adds NO config field when disable_ocr is absent', async (t) => {
    const getForm = mockFetchReturningOk(t);
    const handler = registerHandler();

    await handler({ data: TINY_B64, mime_type: 'application/pdf' });

    assert.equal(getForm().get('config'), null, 'no config field may be added');
  });

  it('adds NO config field when disable_ocr is explicitly false', async (t) => {
    const getForm = mockFetchReturningOk(t);
    const handler = registerHandler();

    await handler({ data: TINY_B64, mime_type: 'application/pdf', disable_ocr: false });

    assert.equal(getForm().get('config'), null, 'falsy disable_ocr must not add config');
  });

  it('forwards user config verbatim when disable_ocr is absent', async (t) => {
    const getForm = mockFetchReturningOk(t);
    const handler = registerHandler();

    await handler({
      data: TINY_B64,
      mime_type: 'application/pdf',
      config: { pages: { insert_page_markers: true } },
    });

    assert.deepEqual(
      JSON.parse(getForm().get('config')),
      { pages: { insert_page_markers: true } },
      'existing behavior: user config reaches the form unchanged',
    );
  });

  it("injects an ocr block from ocr_engine 'tesseract' into config", async (t) => {
    const getForm = mockFetchReturningOk(t);
    const handler = registerHandler();

    await handler({ data: TINY_B64, mime_type: 'application/pdf', ocr_engine: 'tesseract' });

    assert.deepEqual(
      JSON.parse(getForm().get('config')),
      { ocr: { backend: 'tesseract', vlm_fallback: { mode: 'disabled' } } },
      'ocr_engine must inject a tesseract ocr block when no user ocr config exists',
    );
  });
});

describe('resolveExtractBytesConfig precedence', () => {
  // resolveExtractBytesConfig → buildOcrConfig reads shared config; save/restore
  // the keys it touches so cases are hermetic.
  const KEY = 'vlmOcrModel';
  let saved;

  const saveConfig = () => {
    saved = config[KEY];
  };
  const restoreConfig = () => {
    config[KEY] = saved;
    saved = undefined;
  };

  afterEach(restoreConfig);

  it("injects an ocr block from ocr_engine 'tesseract', preserving user keys", () => {
    const result = resolveExtractBytesConfig({
      config: { pages: { insert_page_markers: true } },
      ocr_engine: 'tesseract',
    });
    assert.deepEqual(result, {
      pages: { insert_page_markers: true },
      ocr: { backend: 'tesseract', vlm_fallback: { mode: 'disabled' } },
    });
  });

  it("leaves config unchanged for ocr_engine 'auto'", () => {
    const result = resolveExtractBytesConfig({
      config: { pages: { insert_page_markers: true } },
      ocr_engine: 'auto',
    });
    assert.deepEqual(result, { pages: { insert_page_markers: true } });
    assert.ok(!('ocr' in result), "'auto' must not inject an ocr key");
  });

  it('leaves config unchanged when ocr_engine is omitted', () => {
    const result = resolveExtractBytesConfig({
      config: { pages: { insert_page_markers: true } },
    });
    assert.deepEqual(result, { pages: { insert_page_markers: true } });
  });

  it("disable_ocr:true wins over ocr_engine — no ocr injection, disable_ocr merged", () => {
    const result = resolveExtractBytesConfig({
      config: { pages: { insert_page_markers: true } },
      ocr_engine: 'tesseract',
      disable_ocr: true,
    });
    assert.deepEqual(result, {
      pages: { insert_page_markers: true },
      disable_ocr: true,
    });
    assert.ok(!('ocr' in result), 'disable_ocr must suppress ocr injection');
  });

  it("user-supplied config.ocr wins over ocr_engine, verbatim, without validating the engine", () => {
    saveConfig();
    config[KEY] = null; // vlm would otherwise throw — must never be reached
    const userOcr = { backend: 'vlm', vlm_config: { model: 'my-custom' } };
    const result = resolveExtractBytesConfig({
      config: { ocr: userOcr },
      ocr_engine: 'vlm',
    });
    assert.deepEqual(result, { ocr: userOcr });
  });

  it("injects a complete vlm ocr block for ocr_engine 'vlm' when XBERG_VLM_OCR_MODEL is set", () => {
    saveConfig();
    config[KEY] = 'puma-qwen3.5-2b-instruct';
    const result = resolveExtractBytesConfig({ ocr_engine: 'vlm' });
    assert.deepEqual(result, {
      ocr: {
        backend: 'vlm',
        vlm_fallback: { mode: 'disabled' },
        vlm_config: { model: 'puma-qwen3.5-2b-instruct' },
      },
    });
  });

  it("throws for ocr_engine 'vlm' when XBERG_VLM_OCR_MODEL is unset", () => {
    saveConfig();
    config[KEY] = null;
    assert.throws(
      () => resolveExtractBytesConfig({ ocr_engine: 'vlm' }),
      /ocr_engine 'vlm' requires XBERG_VLM_OCR_MODEL/,
    );
  });

  it("treats unknown engines like omitted (no injection; server default applies)", () => {
    const result = resolveExtractBytesConfig({
      config: { pages: { insert_page_markers: true } },
      ocr_engine: 'bogus',
    });
    assert.deepEqual(result, { pages: { insert_page_markers: true } });
  });
});

describe('tools.js handleExtractBytes ocr_engine error surfacing', () => {
  function registerHandler() {
    const server = createMockMcpServer();
    registerTools(server);
    const definition = server.tools.get(TOOLS.EXTRACT_BYTES);
    return definition.handler;
  }

  it("returns an isError result (not a crash) when ocr_engine 'vlm' is unconfigured", async (t) => {
    const saved = config.vlmOcrModel;
    config.vlmOcrModel = null;
    const handler = registerHandler();

    try {
      const result = await handler({
        data: Buffer.from('hello').toString('base64'),
        mime_type: 'application/pdf',
        ocr_engine: 'vlm',
      });
      assert.equal(result.isError, true, 'unconfigured vlm must surface as an MCP error result');
      assert.match(result.content[0].text, /ocr_engine 'vlm' requires XBERG_VLM_OCR_MODEL/);
    } finally {
      config.vlmOcrModel = saved;
    }
  });
});

describe('tools.js zero-any source contract', () => {
  it('tools.js source contains no z.any()', () => {
    const toolsPath = path.resolve(import.meta.dirname, 'tools.js');
    const source = fs.readFileSync(toolsPath, 'utf-8');
    assert.doesNotMatch(source, /z\.any\(\)/, 'tools.js must not use z.any()');
  });
});
