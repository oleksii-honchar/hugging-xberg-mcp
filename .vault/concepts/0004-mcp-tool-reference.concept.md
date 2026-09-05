---
type: concept
title: "MCP Tool Reference — extract_bytes / extract_structured"
createdAt: "2026-08-21T10:59:18Z"
updatedAt: "2026-09-05T10:19:00Z"
tags: [mcp, tools, api-reference, ocr]
see_also: ["architectures/hugging-xberg-mcp/components/0001-src-modules.component.md", "concepts/0003-pdf-support-pagination.concept.md", "decisions/0004-structured-extraction-via-config.decision.md", "concepts/0002-opencode-attachment-uri-bridge.concept.md", "decisions/0007-ocr-engine-knob-request-level-config.decision.md", "specifications/0002-cpu-first-ocr-vlm-fallback.spec.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Concept: MCP Tool Reference — extract_bytes / extract_structured

Stable reference for the two MCP tools exposed by hugging-xberg-mcp.

## `extract_bytes`

Accepts base64-encoded file data or a full data URL (e.g., `data:image/png;base64,...`), decodes to binary, and POSTs to Xberg `POST /extract` as multipart form data. Works for images, PDFs, and other documents (MIME-agnostic).

**Input:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | string | yes | Base64-encoded file data or full data URL |
| `mime_type` | string | no | Optional MIME type hint for the file |
| `config` | object | no | Optional extraction config override as JSON (e.g. `{"pages": {"insert_page_markers": true}}`) |
| `response_format` | string | no | `'json'`, `'toon'`, `'plain'`, `'markdown'`, `'djot'`, `'html'` |
| `ocr_engine` | string | no | `'auto'` (default, CPU-first + VLM fallback), `'tesseract'`, `'paddleocr'`, `'vlm'` (2.2.0+) |

**`response_format` mapping** (server-side):

- `'json'` — omits the format field (default Xberg JSON envelope)
- `'toon'` — maps to the multipart `format=toon` field
- `'plain'` / `'markdown'` / `'djot'` / `'html'` — map to `output_format=<value>` content rendering

**Examples:**

Raw base64:
```json
{
  "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "mime_type": "image/png"
}
```

Data URL:
```json
{
  "data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
}
```

PDF with page markers (see [[concepts/0003-pdf-support-pagination.concept]]):
```json
{
  "data": "data:application/pdf;base64,...",
  "config": {
    "pages": { "insert_page_markers": true }
  }
}
```

## `extract_structured`

Accepts base64-encoded file data or a full data URL. Schema and model are configured server-side via environment variables — only the file data is passed as input. Implemented via Xberg's config-driven structured extraction (`config.structured_extraction`) on `/extract` (DEC-0004).

**Input:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | string | yes | Base64-encoded file data or full data URL |
| `ocr_engine` | string | no | `'auto'` (default, CPU-first + VLM fallback), `'tesseract'`, `'paddleocr'`, `'vlm'` (2.2.0+) |

## Response Envelope (both tools)

Tool results are the Xberg response envelope serialized as JSON text:

```json
{
  "results": [ ... ],
  "errors": [ ... ],
  "summary": { ... }
}
```

⚠️ **Xberg omits the `errors` key when there are no errors — treat a missing `errors` key as an empty list.** (Same for `processing_warnings` when absent.)

## Notes

- Through LiteLLM, use prefixed names: `hugging_xberg-extract_bytes`, `hugging_xberg-extract_structured` (see [[memories/0003-litellm-tool-name-prefixing.memory]])
- opencode attachment URIs (`opencode://attachment/...`) can be passed as `data` — resolved client-side (see [[concepts/0002-opencode-attachment-uri-bridge.concept]])
