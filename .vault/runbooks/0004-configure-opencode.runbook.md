---
type: runbook
title: "Configure opencode for hugging-xberg-mcp"
createdAt: "2026-08-21T10:59:18Z"
updatedAt: "2026-08-21T10:59:18Z"
tags: [operations, opencode, configuration]
see_also: ["memories/0003-litellm-tool-name-prefixing.memory.md", "memories/0004-opencode-no-retry-mcp-connection.memory.md", "memories/0005-category-filter-silently-excludes.memory.md", "concepts/0004-mcp-tool-reference.concept.md", "runbooks/0005-troubleshoot-connectivity.runbook.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Runbook: Configure opencode for hugging-xberg-mcp

Configure hugging-xberg-mcp as a remote MCP server in opencode and validate the config.

## Steps

### 1. MCP server config

```jsonc
// ~/.config/opencode/opencode.json
{
  "mcp": {
    "hugging-xberg": {
      "type": "remote",
      "url": "https://lite-llm.lan/mcp/hugging_xberg",
      "headers": {
        "Authorization": "Bearer <your-litellm-api-key>"
      },
      "enabled": true,
      "category": "documents",
      "enabledTools": [
        // IMPORTANT: Use LiteLLM-prefixed names, not the upstream tool names.
        // LiteLLM prepends "{server_name}-" to every tool when proxying through
        // its /mcp/<server_name> gateway (see memories/0003-litellm-tool-name-prefixing).
        "hugging_xberg-extract_bytes",
        "hugging_xberg-extract_structured"
      ]
      // Timeouts (verified against opencode 1.14.29):
      // - Per-server "timeout" (ms): Timeout in ms for MCP server requests.
      //   Defaults to 5000 (5 seconds) if not specified. The docs frame it as
      //   the timeout for fetching tools at startup, not tool calls.
      //   // "timeout": 60000
    }
  },
  // - experimental.mcp_timeout (ms): Timeout in milliseconds for model context
  //   protocol (MCP) requests. This is the authoritative knob for tool-call
  //   timeouts. Slow OCR can take 1-2 min, so set it well above the default:
  //   // "experimental": { "mcp_timeout": 300000 }  // 5 minutes
  "experimental": {
    "mcp_timeout": 300000
  }
}
```

### 2. Category filtering (important)

The `"category": "documents"` field is used by opencode to filter MCP servers based on the agent's `allowedMcpCategories`. Your agent config must include `"documents"` in its allowed categories, or the tools will be **silently excluded** even if the server connects successfully.

```yaml
# ~/.config/opencode/agents/generalist.md (frontmatter)
allowedMcpCategories:
  - documents    # ← required for hugging-xberg
  - research
  - browser
```

- If the agent has no `allowedMcpCategories`, all servers are loaded (backward-compatible).
- If it has an empty array (`[]`), **ALL** categorized servers are excluded.

### 3. Connection timing (no retry)

opencode connects to MCP servers **at startup only**. If the connection fails during startup (server not ready, DNS failure, TLS rejection), the server is marked as `"failed"` and **there is no retry** — restart opencode after the server becomes available.

Verify reachability before starting opencode:

```bash
curl -v https://lite-llm.lan/mcp/hugging_xberg \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Accept: application/json, text/event-stream'
# A 406 response means the server IS responding (just wrong Accept header for a plain GET)
```

## Verification (config validation checklist)

Validate each field in `opencode.json`:

| Field | Rule |
|-------|------|
| `type` | Must be `"remote"` for HTTP-based MCP |
| `url` | Must match the LiteLLM proxy route (`https://lite-llm.lan/mcp/hugging_xberg`) |
| `headers.Authorization` | Bearer token must have access to this endpoint |
| `enabled` | Must be `true` |
| `category` | Must match your agent's `allowedMcpCategories` |
| `enabledTools` | **Must use LiteLLM-prefixed names** — upstream returns `extract_bytes`, but LiteLLM's gateway returns `hugging_xberg-extract_bytes` |

Then confirm:

- `opencode mcp list` shows hugging-xberg as "connected"
- Tools `hugging_xberg-extract_bytes` and `hugging_xberg-extract_structured` appear in the agent toolset

## Rollback

- Remove the `hugging-xberg` block from `opencode.json` and restart opencode
- For failure diagnosis, see [[0005-troubleshoot-connectivity.runbook]]
