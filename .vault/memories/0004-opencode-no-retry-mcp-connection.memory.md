---
type: memory
title: "opencode Connects to MCP Servers at Startup Only — No Retry"
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-09T10:59:55Z"
tags: [mcp, opencode, gotcha, connection]
see_also: ["runbooks/0001-restart-mcp-stack-puma.runbook.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Memory: opencode Connects to MCP Servers at Startup Only — No Retry

## Fact

opencode connects to MCP servers **at startup only**. If the connection fails during startup (timeout, DNS, TLS), the server is marked as `"failed"` and **there is no retry**. You must restart opencode after the server becomes available.

## Context

Observed during production deployment on puma.lan. opencode started before LiteLLM's MCP proxy was ready, hugging-xberg was marked as failed, and tools never appeared without restarting opencode.

## Impact

- Always verify MCP server is reachable before starting opencode
- Use `curl -v` to the endpoint; a 406 response means the server IS responding
- Restart opencode after fixing MCP connectivity issues
- The category filter only runs AFTER a successful connection — if you never connect, category doesn't matter
