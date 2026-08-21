---
type: runbook
title: "Test hugging-xberg-mcp (Local / Remote / mcp-test)"
createdAt: "2026-08-21T10:59:18Z"
updatedAt: "2026-08-21T10:59:18Z"
tags: [testing, operations, mcp]
see_also: ["concepts/0001-mcp-streamable-http-stateless.concept.md", "runbooks/0002-deploy-xberg-stack.runbook.md", "concepts/0004-mcp-tool-reference.concept.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Runbook: Test hugging-xberg-mcp (Local / Remote / mcp-test)

Three testing procedures: local smoke test, remote test through LiteLLM, and the mcp-test fixture.

## Steps

### 1. Local smoke test

```bash
# Start server locally (Xberg not needed for tools/list)
node src/mcp-server.mjs

# In another terminal:
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expected: JSON-RPC response with `tools` array containing `extract_bytes` and `extract_structured`.

### 2. Remote test (through LiteLLM)

```bash
cd /Users/oleksii.honchar/www/misc/hugging-xberg-mcp
./test-remote.sh  # Requires .env with LITELLM_API_KEY
```

Also supports targeted calls:

```bash
# List tools:
test-remote.sh http://localhost:3000/mcp tools/list

# Call a tool:
test-remote.sh http://localhost:3000/mcp tools/call '{"name":"extract_bytes","arguments":{"data":"base64=="}}'
```

### 3. mcp-test fixture

```bash
cd /Users/oleksii.honchar/www/misc/better-opencode/scripts/mcp-test
bash mcp-test.sh --server hugging-xberg
```

## Verification

- `tools/list` returns both tools (unprefixed locally, `hugging_xberg-*` through LiteLLM)
- A `tools/call` to `extract_bytes` with a small base64 image returns the Xberg envelope `{results, summary}` (`errors` omitted when empty)

## Rollback

Not applicable (read-only tests). If a test fails, see the troubleshooting runbook: [[0005-troubleshoot-connectivity.runbook]]
