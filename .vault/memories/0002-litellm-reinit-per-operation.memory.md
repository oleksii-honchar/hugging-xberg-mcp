---
type: memory
title: "LiteLLM Reinitializes MCP Session Per Operation"
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-09T10:59:55Z"
tags: [mcp, litellm, gotcha, session]
see_also: ["concepts/0001-mcp-streamable-http-stateless.concept.md", "architectures/hugging-xberg-mcp/containers/0001-system-container.container.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Memory: LiteLLM Reinitializes MCP Session Per Operation

## Fact

LiteLLM's `MCPClient.run_with_session()` wraps **every operation** (list_tools, call_tool, etc.) in a full MCP lifecycle: create transport → **call initialize** → execute operation → close session. Every operation opens a fresh session, calls `initialize`, then closes everything.

## Context

Discovered while building the original hugging-kreuzberg-mcp (pre-port; now hugging-xberg-mcp, see ADR-0005) to work behind LiteLLM's MCP proxy. The server must handle this gracefully — be stateless or tolerate re-initialization. Verified against LiteLLM source code (`experimental_mcp_client/client.py`).

## Impact

- Server must handle `initialize` on every request — LiteLLM always calls it first
- Server should be stateless (no session tracking) — `sessionIdGenerator: undefined`
- Creating a fresh `McpServer` instance per request avoids "Stateless transport cannot be reused" errors
- Session state stored on the server side is not compatible with this pattern
