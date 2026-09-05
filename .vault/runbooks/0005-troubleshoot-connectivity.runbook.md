---
type: runbook
title: "Troubleshoot hugging-xberg-mcp Connectivity"
createdAt: "2026-08-21T10:59:18Z"
updatedAt: "2026-08-21T10:59:18Z"
tags: [operations, troubleshooting, diagnostics]
see_also: ["runbooks/0004-configure-opencode.runbook.md", "runbooks/0001-restart-mcp-stack-puma.runbook.md", "memories/0004-opencode-no-retry-mcp-connection.memory.md", "memories/0003-litellm-tool-name-prefixing.memory.md", "memories/0006-base64-corruption-422-errors.memory.md", "decisions/0001-raise-body-limit.decision.md", "decisions/0002-preserve-status-codes.decision.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Runbook: Troubleshoot hugging-xberg-mcp Connectivity

Common issues, diagnostics, and fixes for connecting hugging-xberg-mcp to opencode via LiteLLM.

**Architecture reminder:** opencode → HTTPS/Bearer → `https://lite-llm.lan/mcp/hugging_xberg` → Caddy (internal TLS, self-signed CA) → LiteLLM:4000 (puma.lan Docker) → MCP proxy → `http://hugging-xberg-mcp:3000/mcp` (Docker internal network, NO host port mapping) → `http://xberg:8000`.

## Quick Diagnostic Checklist

```bash
# 1. Containers running?
docker ps --filter 'name=hugging-xberg'
# Expected: both hugging-xberg-mcp AND xberg (Xberg extraction backend) up

# 2. MCP server healthy?
curl -v https://lite-llm.lan/mcp/hugging_xberg \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Accept: application/json, text/event-stream'
# Expected: HTTP/2 406 (Not Acceptable) — this means the server IS responding
# A 406 is normal for a plain GET; MCP uses POST with SSE

# 3. LiteLLM proxying correctly?
docker logs /lite-llm 2>&1 | grep -i 'xberg' | tail -20
# Expected: 200 OK / 202 Accepted entries, no connection errors

# 4. opencode can reach the server?
opencode mcp list
# Expected: hugging-xberg shows "connected"
```

## Common Issues

### Issue 1: Tools not loaded in opencode ("hugging_xberg tool not found")

**Symptom:** The tools don't appear in the agent's available tools, even though the config is correct.

**Root cause:** opencode connects to MCP servers at startup. If the connection fails during startup (timeout, DNS, TLS), the server is marked as `"failed"` and **there is no retry**. The category filter only runs AFTER a successful connection — if you never connect, the category doesn't matter. (See [[memories/0004-opencode-no-retry-mcp-connection.memory]]).

**Diagnostics:**

```bash
opencode mcp list
# If hugging-xberg shows "failed", check why:
opencode mcp logs hugging-xberg 2>&1 | tail -20

docker logs /lite-llm 2>&1 | grep -i 'xberg' | grep -v '200 OK\|202 Accepted'
```

**Fixes:**

1. **Timing issue** — opencode started before LiteLLM's MCP proxy was ready:
   ```bash
   curl -v https://lite-llm.lan/mcp/hugging_xberg \
     -H 'Authorization: Bearer YOUR_API_KEY' \
     -H 'Accept: application/json, text/event-stream'
   # If you get 406 or any HTTP response, the server is ready. Restart opencode.
   ```
2. **TLS certificate issue** — Caddy uses `tls internal` (self-signed CA). Node.js may reject it:
   ```bash
   curl -v https://lite-llm.lan/mcp/hugging_xberg 2>&1 | grep -i 'certificate\|SSL'
   # If TLS fails: a) set NODE_EXTRA_CA_CERTS, b) use http:// (same host), c) trusted cert in Caddy
   ```
3. **DNS resolution** — `lite-llm.lan` doesn't resolve from where opencode runs:
   ```bash
   nslookup lite-llm.lan
   dig lite-llm.lan
   # If DNS fails, add to /etc/hosts or configure your local DNS resolver
   ```
4. **Agent category mismatch** — the agent's `allowedMcpCategories` doesn't include `"documents"` (see [[memories/0005-category-filter-silently-excludes.memory]]):
   ```bash
   grep -A5 'allowedMcpCategories' ~/.config/opencode/agents/generalist.md
   # Must include: - documents
   ```

### Issue 1b: Tools filtered out — "all tools filtered out for MCP server"

**Symptom:** opencode logs show:

```
WARN enabledTools=["extract_bytes","extract_structured"] all tools filtered out for MCP server
```

**Root cause:** LiteLLM prefixes tool names with `{server_name}-` when proxying (see [[memories/0003-litellm-tool-name-prefixing.memory]]). `enabledTools` with unprefixed names won't match — ALL tools get filtered out.

**Fix:** Use LiteLLM-prefixed tool names:

```jsonc
// Wrong — upstream names don't match what LiteLLM returns
"enabledTools": ["extract_bytes", "extract_structured"]

// Correct — matches LiteLLM-prefixed names
"enabledTools": ["hugging_xberg-extract_bytes", "hugging_xberg-extract_structured"]
```

### Issue 2: LiteLLM 403 — "User not allowed to call this tool"

**Symptom:** LiteLLM logs show `HTTPException in MCP tool call: 403: User not allowed to call this tool`.

**Root cause:** LiteLLM's internal API key authorization — the Bearer token may not have permission to call MCP tools through LiteLLM.

**Fix:**

```bash
curl -X GET https://lite-llm.lan/v1/user/permissions \
  -H 'Authorization: Bearer YOUR_API_KEY'
# If needed, grant MCP access via LiteLLM admin API or config
```

**Note:** This error appears when calling tools THROUGH LiteLLM's chat API (e.g., from the dashboard). When opencode connects directly to the MCP endpoint, it bypasses this auth layer — the 403 in logs doesn't necessarily mean opencode can't connect.

### Issue 3: "Method not found" for list_resources / list_prompts

**Symptom:** LiteLLM logs show `MCP client list_resources failed - Error: Method not found` (and `list_prompts`).

**Root cause:** hugging-xberg-mcp only implements tools (`extract_bytes`, `extract_structured`). It does NOT implement the optional MCP methods `list_resources` and `list_prompts`. LiteLLM tries to discover all capabilities and logs these as errors.

**Impact:** **None. Benign.** The tools still work correctly.

### Issue 4: 406 Not Acceptable on GET requests

**Symptom:** `GET /mcp/hugging_xberg HTTP/1.1" 406 Not Acceptable`.

**Root cause:** MCP Streamable HTTP requires `Accept: text/event-stream` or `Accept: application/json`. Plain GET requests without the right Accept header get rejected.

**Impact:** Only affects health checks and manual curl tests. The opencode client sends proper headers.

### Issue 5: 413 Payload Too Large

**Symptom:** `Payload too large — request body must be under 50MB`.

**Root cause:** The base64 JSON body exceeds the Express body limit (`MCP_BODY_LIMIT`, default 50mb). Base64 adds ~33% overhead: 36.5MB raw → ~48.9MB base64 (the `MAX_BASE64_LENGTH` client guard threshold).

**Fix:**
- Keep files under ~36.5MB raw (base64 ≤ 48_900_000 chars), or
- Raise `MCP_BODY_LIMIT` (e.g., `MCP_BODY_LIMIT=60mb`) — but keep `MAX_BASE64_LENGTH` aligned with the server limit (see [[decisions/0003-align-client-guard.decision]])

### Issue 6: Xberg extraction errors (422 ParsingError / processing warnings)

**Symptom:** `Xberg error (422): {"error_type":"ParsingError","message":"..."}`.

**Root cause:** The file data is corrupted, not a supported format, or the VLM OCR backend is unreachable. The response envelope may carry `processing_warnings` (e.g., LiteLLM connection failures) — check those before assuming file corruption.

**Fix:**

```bash
# Verify the base64 data is valid:
echo "BASE64_DATA" | base64 -d > /tmp/test.pdf
file /tmp/test.pdf
# Should output: PDF document, ...
```

**Historical note (pre-port):** The old kreuzberg backend returned `422 ParsingError: Failed to decode image: Format error decoding Png: CRC error` for corrupted PNG data. The xberg backend reports errors differently (see the `errors`/`processing_warnings` keys in the response envelope); the base64-validation checklist above still applies. See [[memories/0006-base64-corruption-422-errors.memory]].

## Verification

- All 4 diagnostic checklist steps pass
- `opencode mcp list` shows "connected" and tools are present in the agent toolset

## Rollback

- For restarts/full reset: see [[0001-restart-mcp-stack-puma.runbook]]
