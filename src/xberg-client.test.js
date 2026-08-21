import { extractBase64, extractBytes, extractStructured } from './xberg-client.js';
import { config } from './config.js';
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Real multi-page PDF fixture used by the PDF fixture test (fixtures/multi-page.pdf). */
const pdfFixturePath = path.resolve(import.meta.dirname, '../fixtures/multi-page.pdf');

const MAX_BASE64_LENGTH = 48_900_000;

/**
 * Mock global fetch, capturing the last outbound request.
 * Returns { restore } — call in afterEach.
 */
function mockFetch(responseFactory) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const call = { url, options, body: options?.body };
    calls.push(call);
    return responseFactory(call);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

const okResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({ results: [], errors: [], summary: { results: 0, errors: 0 } }),
});

const failResponse = (status = 500, text = 'boom') => ({
  ok: false,
  status,
  text: async () => text,
});

describe('extractBase64', () => {
  it('throws on undefined input', () => {
    assert.throws(() => extractBase64(undefined), /Missing data parameter/);
  });

  it('throws on empty string', () => {
    assert.throws(() => extractBase64(''), /Missing data parameter/);
  });

  it('throws on HTTP URL', () => {
    assert.throws(() => extractBase64('http://example.com/img.png'), /HTTP URLs are not supported/);
  });

  it('throws on HTTPS URL', () => {
    assert.throws(() => extractBase64('https://example.com/img.png'), /HTTP URLs are not supported/);
  });

  it('passes through opencode attachment URIs', () => {
    const input = 'opencode://attachment/test-uuid.png';
    assert.equal(extractBase64(input), input);
  });

  it('extracts base64 from data URL', () => {
    const input = 'data:image/png;base64,iVBORw0KGgo';
    assert.equal(extractBase64(input), 'iVBORw0KGgo');
  });

  it('passes through raw base64 unchanged', () => {
    const input = 'iVBORw0KGgoAAAANSUhEUgAA';
    assert.equal(extractBase64(input), input);
  });

  // --- Base64 size validation (new limit 48_900_000) ---

  it('allows base64 at the size limit', () => {
    const atLimit = 'a'.repeat(MAX_BASE64_LENGTH);
    assert.equal(extractBase64(atLimit), atLimit);
  });

  it('rejects base64 exceeding size limit', () => {
    const oversized = 'a'.repeat(MAX_BASE64_LENGTH + 1);
    assert.throws(() => extractBase64(oversized), /Base64 data exceeds size limit/);
  });

  it('error message reflects the new max limit value', () => {
    const oversized = 'a'.repeat(MAX_BASE64_LENGTH + 1);
    assert.throws(
      () => extractBase64(oversized),
      new RegExp(`max ${MAX_BASE64_LENGTH}`),
    );
  });

  it('error message mentions chrome-devtools take_screenshot resize', () => {
    const oversized = 'a'.repeat(MAX_BASE64_LENGTH + 1);
    assert.throws(
      () => extractBase64(oversized),
      /take_screenshot.*resize|resize.*take_screenshot/i,
    );
  });

  it('rejects oversized base64 in data URL', () => {
    const oversized = 'a'.repeat(MAX_BASE64_LENGTH + 1);
    const dataUrl = `data:image/png;base64,${oversized}`;
    assert.throws(() => extractBase64(dataUrl), /Base64 data exceeds size limit/);
  });

  it('allows opencode attachment URI regardless of apparent size', () => {
    const input = 'opencode://attachment/test-uuid.png';
    assert.equal(extractBase64(input), input);
  });
});

describe('extractBytes outbound request', () => {
  let mock;

  afterEach(() => {
    mock?.restore();
    mock = null;
  });

  it('POSTs multipart files+config to `${config.xbergUrl}/extract` with mime_type', async () => {
    mock = mockFetch(okResponse);
    const data = Buffer.from('hello world').toString('base64');

    await extractBytes({ data, mime_type: 'application/pdf', config: { pages: { insert_page_markers: true } } });

    assert.equal(mock.calls.length, 1);
    const { url, options, body } = mock.calls[0];
    assert.equal(url, `${config.xbergUrl}/extract`);
    assert.equal(options.method, 'POST');
    assert.ok(body instanceof FormData);
    const file = body.get('files');
    assert.ok(file instanceof File);
    assert.equal(file.type, 'application/pdf');
    assert.equal(body.get('config'), JSON.stringify({ pages: { insert_page_markers: true } }));
  });

  it('uses application/octet-stream when mime_type is omitted', async () => {
    mock = mockFetch(okResponse);
    const data = Buffer.from('hello').toString('base64');

    await extractBytes({ data });

    const file = mock.calls[0].body.get('files');
    assert.equal(file.type, 'application/octet-stream');
  });

  it('omits config field when config is undefined', async () => {
    mock = mockFetch(okResponse);
    const data = Buffer.from('hello').toString('base64');

    await extractBytes({ data });

    assert.equal(mock.calls[0].body.get('config'), null);
  });

  it("maps response_format 'toon' to form field format=toon", async () => {
    mock = mockFetch(okResponse);
    const data = Buffer.from('hello').toString('base64');

    await extractBytes({ data, response_format: 'toon' });

    const body = mock.calls[0].body;
    assert.equal(body.get('format'), 'toon');
    assert.equal(body.get('output_format'), null);
  });

  it("maps response_format 'json' to no format fields (default JSON envelope)", async () => {
    mock = mockFetch(okResponse);
    const data = Buffer.from('hello').toString('base64');

    await extractBytes({ data, response_format: 'json' });

    const body = mock.calls[0].body;
    assert.equal(body.get('format'), null);
    assert.equal(body.get('output_format'), null);
  });

  it("maps response_format 'markdown' to form field output_format=markdown", async () => {
    mock = mockFetch(okResponse);
    const data = Buffer.from('hello').toString('base64');

    await extractBytes({ data, response_format: 'markdown' });

    const body = mock.calls[0].body;
    assert.equal(body.get('format'), null);
    assert.equal(body.get('output_format'), 'markdown');
  });

  it("maps response_format 'plain' to form field output_format=plain", async () => {
    mock = mockFetch(okResponse);
    const data = Buffer.from('hello').toString('base64');

    await extractBytes({ data, response_format: 'plain' });

    const body = mock.calls[0].body;
    assert.equal(body.get('format'), null);
    assert.equal(body.get('output_format'), 'plain');
  });

  it("maps response_format 'djot' to form field output_format=djot", async () => {
    mock = mockFetch(okResponse);
    const data = Buffer.from('hello').toString('base64');

    await extractBytes({ data, response_format: 'djot' });

    const body = mock.calls[0].body;
    assert.equal(body.get('format'), null);
    assert.equal(body.get('output_format'), 'djot');
  });

  it("maps response_format 'html' to form field output_format=html", async () => {
    mock = mockFetch(okResponse);
    const data = Buffer.from('hello').toString('base64');

    await extractBytes({ data, response_format: 'html' });

    const body = mock.calls[0].body;
    assert.equal(body.get('format'), null);
    assert.equal(body.get('output_format'), 'html');
  });

  it('returns {ok:true, body} on success', async () => {
    mock = mockFetch(okResponse);
    const data = Buffer.from('hello').toString('base64');

    const result = await extractBytes({ data });

    assert.equal(result.ok, true);
    assert.deepEqual(result.body, { results: [], errors: [], summary: { results: 0, errors: 0 } });
  });

  it('returns {ok:false, status, error} with Xberg error prefix on failure', async () => {
    mock = mockFetch(() => failResponse(500, 'kaboom'));
    const data = Buffer.from('hello').toString('base64');

    const result = await extractBytes({ data });

    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
    assert.match(result.error, /Xberg error \(500\): kaboom/);
  });
});

describe('extractStructured outbound request', () => {
  let mock;

  afterEach(() => {
    mock?.restore();
    mock = null;
  });

  it('POSTs multipart files+config to `/extract` carrying structured_extraction config', async () => {
    mock = mockFetch(okResponse);
    const data = Buffer.from('hello world').toString('base64');

    const result = await extractStructured(data);

    assert.equal(result.ok, true);
    assert.equal(mock.calls.length, 1);
    const { url, options, body } = mock.calls[0];
    assert.equal(url, `${config.xbergUrl}/extract`);
    assert.ok(!url.includes('/extract-structured'), 'must not call /extract-structured');
    assert.equal(options.method, 'POST');
    assert.ok(body instanceof FormData);

    const file = body.get('files');
    assert.ok(file instanceof File, 'must send `files` field (same shape as extractBytes)');

    const configJson = JSON.parse(body.get('config'));
    assert.ok(configJson.structured_extraction, 'config must carry structured_extraction');
    assert.deepEqual(
      configJson.structured_extraction.schema,
      JSON.parse(config.structuredSchema),
      'schema must be the parsed JSON Schema value',
    );
    assert.equal(configJson.structured_extraction.schema_name, config.structuredSchemaName);
    assert.equal(configJson.structured_extraction.strict, config.structuredStrict);
  });

  it('returns {ok:false, status, error} with Xberg error prefix on failure', async () => {
    mock = mockFetch(() => failResponse(400, 'bad request'));
    const data = Buffer.from('hello').toString('base64');

    const result = await extractStructured(data);

    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.error, /Xberg error \(400\): bad request/);
  });
});

describe('PDF fixture passthrough (integration-style unit test)', () => {
  let mock;

  afterEach(() => {
    mock?.restore();
    mock = null;
  });

  it('multi-page PDF fixture exists and is a real PDF (header + 2+ pages)', () => {
    const raw = readFileSync(pdfFixturePath);
    const header = raw.subarray(0, 8).toString('latin1');
    assert.match(header, /^%PDF-/, 'fixture must be a real PDF (%PDF- header)');

    const text = raw.toString('latin1');
    const pageObjects = text.match(/\/Type\s*\/Page[\s/]/g) ?? [];
    assert.ok(
      pageObjects.length >= 2,
      `fixture must contain at least 2 pages, found ${pageObjects.length}`,
    );
  });

  it('extractBytes passes through the xberg {results, errors, summary} envelope for the PDF fixture', async () => {
    const stubEnvelope = {
      results: [
        {
          content: '<!-- PAGE 1 -->\nPage 1 content.\n<!-- PAGE 2 -->\nPage 2 content.',
          pages: '2',
          metadata: { page_count: 2 },
        },
      ],
      errors: [],
      summary: { results: 1, errors: 0 },
    };
    mock = mockFetch(() => ({ ok: true, status: 200, json: async () => stubEnvelope }));

    const data = readFileSync(pdfFixturePath).toString('base64');
    const result = await extractBytes({
      data,
      mime_type: 'application/pdf',
      config: { pages: { insert_page_markers: true } },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.body, stubEnvelope, 'client must pass through {results, errors, summary}');
    assert.ok(result.body.results[0].content.includes('<!-- PAGE 1 -->'));
    assert.ok(result.body.results[0].content.includes('<!-- PAGE 2 -->'));
  });

  it('forwards config.pages.insert_page_markers to xberg in the multipart config field', async () => {
    mock = mockFetch(okResponse);

    const data = readFileSync(pdfFixturePath).toString('base64');
    await extractBytes({
      data,
      mime_type: 'application/pdf',
      config: { pages: { insert_page_markers: true } },
    });

    assert.equal(mock.calls.length, 1);
    const body = mock.calls[0].body;
    assert.equal(body.get('files').type, 'application/pdf');
    assert.deepEqual(
      JSON.parse(body.get('config')),
      { pages: { insert_page_markers: true } },
      'config must reach xberg verbatim',
    );
  });
});
