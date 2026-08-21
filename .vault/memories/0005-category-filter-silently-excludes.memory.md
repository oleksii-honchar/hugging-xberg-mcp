---
type: memory
title: "opencode Category Filter Silently Excludes MCP Servers"
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-09T10:59:55Z"
tags: [mcp, opencode, gotcha, filtering]
see_also: ["runbooks/0005-troubleshoot-connectivity.runbook.md", "runbooks/0004-configure-opencode.runbook.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Memory: opencode Category Filter Silently Excludes MCP Servers

## Fact

opencode's `allowedMcpCategories` in agent config silently excludes MCP servers whose `category` doesn't match. No error, no warning — the server connects successfully but tools never appear.

## Context

Observed during hugging-xberg-mcp integration (originally discovered with the pre-port hugging-kreuzberg-mcp, see ADR-0005). The server was configured with `"category": "documents"`, but the agent's `allowedMcpCategories` didn't include `"documents"`. Tools were silently excluded.

## Impact

- Agent config must include the MCP server's category in `allowedMcpCategories`
- Empty array `[]` excludes ALL categorized servers
- If agent has no `allowedMcpCategories`, all servers load (backward-compatible)
- This is a common cause of "tools not loaded" issues — always check category match
