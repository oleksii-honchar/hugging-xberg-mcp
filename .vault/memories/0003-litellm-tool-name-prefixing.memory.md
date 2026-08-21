---
type: memory
title: "LiteLLM Prepends Server Name to MCP Tool Names"
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-09T10:59:55Z"
tags: [mcp, litellm, gotcha, tool-names]
see_also: ["architectures/hugging-xberg-mcp/containers/0001-system-container.container.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Memory: LiteLLM Prepends Server Name to MCP Tool Names

## Fact

When LiteLLM proxies an MCP server through its gateway (`/mcp/<server_name>`), it **prepends the server name** to every tool name returned by `tools/list`. The format is `{server_name}-{tool_name}`.

## Context

Discovered during the original hugging-kreuzberg-mcp integration (pre-port; now hugging-xberg-mcp, see ADR-0005). Upstream server returns `extract_bytes`, but LiteLLM returns `hugging_xberg-extract_bytes` (previously `hugging_kreuzberg-extract_bytes`). This caused "all tools filtered out" errors when `enabledTools` used unprefixed names.

## Impact

- `enabledTools` in opencode config must use prefixed names (e.g., `hugging_xberg-extract_bytes`)
- Tool invocation through LiteLLM gateway must use prefixed names
- Direct server calls bypass LiteLLM — use unprefixed names
- Any MCP server behind LiteLLM follows this pattern (e.g., `paperless-list_documents`)
