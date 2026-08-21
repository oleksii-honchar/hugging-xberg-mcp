---
type: index
title: "Operational Runbooks"
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-21T10:59:18Z"
tags: []
---

# Operational Runbooks

Procedures for operating and maintaining the hugging-xberg MCP server (port of the previous hugging-kreuzberg-mcp wrapper).

## Nodes

- [[0001-restart-mcp-stack-puma.runbook]] — Restart MCP stack on puma.lan (docker compose + opencode restart)
- [[0002-deploy-xberg-stack.runbook]] — Deploy stack (Docker Compose + env vars + LiteLLM config + schema override)
- [[0003-test-mcp-server.runbook]] — Test MCP server (local smoke / remote via LiteLLM / mcp-test fixture)
- [[0004-configure-opencode.runbook]] — Configure opencode (MCP config + category + connection timing + validation)
- [[0005-troubleshoot-connectivity.runbook]] — Troubleshoot connectivity (diagnostic checklist + Issues 1–6)
