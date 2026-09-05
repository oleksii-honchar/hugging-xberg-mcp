---
type: concept
title: "MCP Streamable HTTP Stateless Transport"
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-21T10:59:18Z"
tags: [mcp, transport, streamable-http, litellm]
see_also: ["memories/0002-litellm-reinit-per-operation.memory.md", "architectures/hugging-xberg-mcp/containers/0001-system-container.container.md", "architectures/hugging-xberg-mcp/components/0001-src-modules.component.md", "runbooks/0003-test-mcp-server.runbook.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Concept: MCP Streamable HTTP Stateless Transport

## What

The Streamable HTTP transport for MCP is a stateless protocol where each JSON-RPC method call is a separate HTTP POST request to the same `/mcp` endpoint. No persistent connection or session state on the wire. The server creates a fresh `McpServer` + `StreamableHTTPServerTransport` per request.

## Why

This transport pattern is required for LiteLLM compatibility — LiteLLM's client opens a fresh session, initializes, calls the operation, and closes for **every operation**. Stateless transport avoids "cannot be reused" errors and is the only pattern that works behind LiteLLM's MCP proxy.

## Key Details

- **Endpoint:** `POST /mcp` on port 3000, JSON-RPC 2.0 over SSE or direct JSON
- **Session mode:** Stateless — `sessionIdGenerator: undefined`, fresh `McpServer` per request
- **GET/DELETE /mcp:** Returns 405 (not used by LiteLLM)
- **Accept header:** `application/json, text/event-stream`
- **Response:** SSE-wrapped (`event: message\ndata: {...}`) or direct JSON
- **Express body parser:** Must have 50mb limit for base64 images/PDFs (`MCP_BODY_LIMIT`, env-configurable — see DEC-0001)
- **Error handling:** Preserve `err.status` (413→413, else 500) with JSON-RPC error codes

## LiteLLM Protocol — What Upstream Servers Must Do

Ground truth: paperless-mcp (confirmed working via LiteLLM) + LiteLLM source (`experimental_mcp_client/client.py`, `proxy/_experimental/mcp_server/mcp_server_manager.py`).

LiteLLM uses the **Streamable HTTP** transport (not SSE-only); its client is the Python MCP SDK's `mcp.client.streamable_http.streamable_http_client`.

### Endpoint & Methods

- `POST http://<upstream>:3000/mcp` — all MCP operations (initialize, tools/list, tools/call, etc.)
- GET /mcp — not used by LiteLLM; servers may return 405
- DELETE /mcp — not used by LiteLLM; servers may return 405
- Configured in LiteLLM's `config.yaml` under `mcp_servers:` (e.g., `hugging_xberg.url: "http://hugging-xberg-mcp:3000/mcp"`)

### Request Headers

| Header | Value | Required |
|--------|-------|----------|
| `Content-Type` | `application/json` | Yes |
| `Accept` | `application/json, text/event-stream` | Yes — LiteLLM sends both MIME types |

### Authentication Headers (if configured on LiteLLM side)

| Auth Type | Header | Format |
|-----------|--------|--------|
| `bearer_token` | `Authorization` | `Bearer <token>` |
| `basic` | `Authorization` | `Basic <base64(user:pass)>` |
| `api_key` | `X-API-Key` | `<key>` |
| `oauth2` | `Authorization` | `Bearer <token>` |

### Session Lifecycle — Three Operations

Each JSON-RPC method call is a separate HTTP request with an incrementing integer `id`.

1. **initialize** → response carries `protocolVersion`, `capabilities`, `serverInfo`, `instructions`
2. **tools/list** → response carries `tools[]` with `name`, `description`, `inputSchema`
3. **tools/call** → response carries `content: [{type: "text", text: "..."}]`; tool results are the Xberg envelope `{results, errors, summary}` serialized as JSON text (**`errors` omitted when empty** — treat missing as empty list)

⚠️ **Fresh session per operation:** LiteLLM's `MCPClient.run_with_session()` wraps **every operation** in a full lifecycle — create transport → **call `initialize`** → execute operation → close everything. The server must be stateless or tolerate re-initialization (see [[memories/0002-litellm-reinit-per-operation.memory]]).

### Response Formats

LiteLLM accepts **both**:

1. **SSE-wrapped JSON-RPC** — `Content-Type: text/event-stream`, `event: message` + `data: {...}`
2. **Direct JSON** — `Content-Type: application/json`

The MCP SDK's `StreamableHTTPServerTransport` handles both automatically.

### Error Handling

| HTTP status | Meaning |
|-------------|---------|
| 200 | Success (SSE or JSON response) |
| 405 | Method not allowed (GET/DELETE on /mcp) |
| 413 | Payload too large — mapped to JSON-RPC -32600 (see DEC-0002) |
| 500 | Internal server error (JSON-RPC -32603) |

Standard JSON-RPC 2.0 error codes apply: -32700, -32600, -32601, -32602, -32603, and -32000..-32099 for application-specific errors.

Tool-level errors return `isError: true` in the result:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{"type": "text", "text": "Xberg error (500): Internal server error"}],
    "isError": true
  }
}
```

### Server-Side Implementation Pattern (this project)

```js
app.use(express.json({ limit: process.env.MCP_BODY_LIMIT || '50mb' }));

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,  // stateless — no session tracking
  });
  // Fresh McpServer per request avoids "Stateless transport cannot be reused" errors
  const server = new McpServer({ name: 'hugging-xberg-mcp', version: '2.0.0' });
  // ... register tools ...
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

### Checklist for Upstream MCP Servers Behind LiteLLM

1. Listen on HTTP (port 3000 or configured port)
2. Expose `POST /mcp` using `StreamableHTTPServerTransport`
3. Accept JSON-RPC 2.0 with `Content-Type: application/json`
4. Respond with SSE (`event: message\ndata: {json}`) or direct JSON
5. **Handle `initialize` on every request** (LiteLLM always initializes first)
6. Be stateless (or tolerate re-initialization) — no session tracking needed
7. Return tool results as `{content: [{type: "text", text: "..."}], isError: false/true}`
8. Return 405 for GET/DELETE on /mcp
9. Handle errors gracefully — JSON-RPC errors or tool-level `isError: true`

Verified against: `src/mcp-server.mjs`, `src/mcp-server.test.mjs`, LiteLLM source.
