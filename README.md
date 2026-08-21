# hugging-xberg-mcp

Wrapper MCP server for [Xberg](https://github.com/xberg-io/xberg) — exposes `extract_bytes` and `extract_structured` as MCP tools, delegating to a remote Xberg REST API (`/extract`).

Port of the previous `hugging-kreuzberg-mcp` wrapper (v1.0.1); the extraction backend was swapped from the olho Kreuzberg fork to upstream Xberg (`ghcr.io/xberg-io/xberg:1.0.14`, pinned).

---

## Architecture

```text
┌──────────────┐    HTTP/MCP     ┌──────────────────────┐    HTTP    ┌──────────────────┐
│  MCP Client  │ ──────────────▶  │  hugging-xberg-mcp   │ ─────────▶ │   Xberg API      │
│  (LiteLLM/   │                  │  (Node.js)           │             │  (REST server)   │
│   opencode)  │ ◀──────────────  │  :3000/mcp           │ ◀────────── │  :8000           │
└──────────────┘                  └──────────────────────┘             └──────────────────┘
```

1. **MCP Client** (LiteLLM / opencode) → calls `extract_*` tools via HTTP POST to `/mcp`
2. **hugging-xberg-mcp** (Node.js, port 3000) → receives MCP calls, POSTs to the Xberg REST API
3. **Xberg API** (`ghcr.io/xberg-io/xberg:1.0.14`) → processes extraction (OCR, PDF parsing, structured extraction), returns results
4. Results flow back: Xberg → hugging-xberg-mcp → MCP Client

**Transport:** Streamable HTTP (not stdio). Stateless — fresh `McpServer` per request.

**Response envelope:** Xberg returns `{results, errors, summary}`. Note: the `errors` key is **omitted when there are no errors** — callers must treat a missing `errors` as an empty list. `summary` carries counts (`{results, errors}`).

### Module Structure

```
src/
├── config.js              # All env vars loaded once at startup
├── logger.js              # Structured logging (info/debug, truncation, masking)
├── xberg-client.js        # Xberg API adapter (fetch, FormData, Result-like errors)
├── tools.js               # MCP tool definitions (thin handlers → delegate to client)
└── mcp-server.mjs         # Server setup (Express + McpServer + transport + shutdown)
```

---

## Tools

### `extract_bytes`

OCR: Read and extract text from images, PDFs, and other documents. Returns extracted text, tables, and document structure.

**Input:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | string | yes | File data in one of these formats: (1) `opencode://attachment/<uuid>` (attached files), (2) `data:image/png;base64,...` (data URL), (3) raw base64 string. **HTTP URLs are NOT supported.** |
| `mime_type` | string | no | Optional MIME type hint for the file |
| `config` | object | no | Optional extraction config override as JSON (passed through to Xberg `/extract`; see [PDF support & pagination](#pdf-support--pagination)) |
| `response_format` | string | no | `'json'` (default envelope), `'toon'`, or `'plain'` / `'markdown'` / `'djot'` / `'html'` content rendering |

**Input size limit:** `MAX_BASE64_LENGTH` = **48,900,000 chars** (~36.5MB raw ≈ 97% of the 50mb JSON body envelope). Larger payloads are rejected by the client guard; the Express body limit (`MCP_BODY_LIMIT`, default **50mb**) rejects oversized requests with HTTP 413 → MCP error -32600.

### `extract_structured`

OCR: Extract structured data from images, PDFs, and other documents into predefined schemas. Returns structured data matching the server-configured schema. Implemented via Xberg's config-driven structured extraction (`config.structured_extraction` on `/extract`) — there is no separate `/extract-structured` endpoint.

**Input:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | string | yes | File data in one of these formats: (1) `opencode://attachment/<uuid>` (attached files), (2) `data:image/png;base64,...` (data URL), (3) raw base64 string. **HTTP URLs are NOT supported.** |

**Server-side config (env vars):**
| Variable | Description |
|----------|-------------|
| `HUGGING_XBERG_STRUCTURED_SCHEMA_NAME` | Schema name (default: `extraction`) |
| `HUGGING_XBERG_STRUCTURED_SCHEMA_DESCRIPTION` | Schema description |
| `HUGGING_XBERG_STRUCTURED_PROMPT` | Custom prompt |
| `HUGGING_XBERG_STRUCTURED_STRICT` | `'true'` for strict mode |
| `XBERG_LLM_MODEL` | LLM model for structured extraction |
| `XBERG_LLM_BASE_URL` | Base URL for LLM |
| `LITELLM_API_KEY` | API key for LLM |

---

## PDF Support & Pagination

`extract_bytes` is MIME-agnostic — PDF base64/data-URL payloads are decoded and POSTed to Xberg, which parses PDFs natively. No new tool is needed.

Pagination is **output-side** (ADR-007): Xberg does **not** support input-side page ranges (`start_page`/`end_page` do not exist). Instead, pass config keys to get per-page navigation:

- **Page markers:** `config.pages.insert_page_markers: true` — extracted text contains `<!-- PAGE {n} -->` markers between pages. ⚠️ Use the key `pages` (plural) — a top-level `page` key is rejected by Xberg with HTTP 400 `ValidationError: unknown field page`.
- **Chunks:** `config.chunking: { "max_characters": 2000 }` — results are chunked and each chunk carries `first_page`/`last_page` metadata.
- **OCR-only pages:** `config.force_ocr_pages: [1, 2]` (1-indexed) — force OCR for specific pages.

Example for a large PDF:

```json
{
  "data": "data:application/pdf;base64,...",
  "config": {
    "pages": { "insert_page_markers": true },
    "chunking": { "max_characters": 2000 }
  }
}
```

---

## Quick Start

### Docker Compose (recommended)

```bash
# Set up environment
export LITELLM_API_KEY="your-key"
export XBERG_VLM_OCR_MODEL="puma-qwopus3.5-9b-instruct"
export XBERG_LLM_BASE_URL="http://lite-llm:4000/v1"

# Start both services (xberg engine + wrapper)
docker compose up -d
```

### Build & Push

```bash
# Build + push MCP image
docker login
./build-and-push.sh

# Build only
./build-and-push.sh --build-only

# Tag with version
./build-and-push.sh --tag v2.0.0

# ARM64 only
./build-and-push.sh --platform linux/arm64
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `XBERG_API_URL` | Xberg REST API URL | `http://xberg:8000` |
| `MCP_PORT` | Port for MCP server | `3000` |
| `MCP_BODY_LIMIT` | Express JSON body limit | `50mb` |
| `LOG_LEVEL` | Logging level (`debug` or any other value) | `info` |
| `LITELLM_API_KEY` | API key for LLM (structured extraction + Xberg VLM OCR) | — |
| `XBERG_LLM_BASE_URL` | LLM base URL for structured extraction | — |
| `XBERG_LLM_MODEL` | LLM model for structured extraction | — |
| `XBERG_VLM_OCR_MODEL` | VLM OCR model for Xberg (engine) | — |
| `HUGGING_XBERG_STRUCTURED_SCHEMA_NAME` | Schema name for structured extraction | `extraction` |
| `HUGGING_XBERG_STRUCTURED_SCHEMA_DESCRIPTION` | Schema description | — |
| `HUGGING_XBERG_STRUCTURED_PROMPT` | Custom prompt | — |
| `HUGGING_XBERG_STRUCTURED_STRICT` | Strict mode (`true`/`false`) | `false` |

---

## Structured Extraction Schema

The default schema is in `src/structured-schema.json`. Override at runtime by mounting a custom schema:

```yaml
volumes:
  - ./my-schema.json:/app/src/structured-schema.json:ro
```

The schema is forwarded to Xberg as `config.structured_extraction.schema` on `/extract`.

---

## Testing

### Local smoke test

```bash
# Start server locally (Xberg not needed for tools/list)
node src/mcp-server.mjs

# In another terminal:
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### Remote test (through LiteLLM)

```bash
cd /Users/oleksii.honchar/www/misc/hugging-xberg-mcp
./test-remote.sh  # Requires .env with LITELLM_API_KEY
```

---

## Documentation

The durable knowledge vault (`.vault/`) is the single source of truth:

- **Architecture:** `.vault/architectures/hugging-xberg-mcp/` — system container diagram, module architecture, data flow
- **Deployment:** `.vault/runbooks/0002-deploy-xberg-stack.runbook.md` — Docker Compose, env vars, LiteLLM config
- **LiteLLM protocol:** `.vault/concepts/0001-mcp-streamable-http-stateless.concept.md` — protocol spec, session lifecycle, upstream checklist
- **opencode integration:** `.vault/runbooks/0004-configure-opencode.runbook.md` + `.vault/concepts/0002-opencode-attachment-uri-bridge.concept.md` — configuration, file attachment flow
- **Tool reference:** `.vault/concepts/0004-mcp-tool-reference.concept.md` — `extract_bytes` / `extract_structured` inputs
- **Troubleshooting:** `.vault/runbooks/0005-troubleshoot-connectivity.runbook.md` — diagnostics and fixes

---

## History

This repository is a port of `hugging-kreuzberg-mcp` (v1.0.1) to the Xberg backend (`hugging-xberg-mcp` v2.0.0). See the in-repo `.vault/` ADR (ADR-0005: `adrs/0005-port-hugging-kreuzberg-to-xberg.adr.md`) and migration memory (`memories/0008-kreuzberg-to-xberg-migration.memory.md`) for the port record.

## License

MIT — see `LICENSE`.
