---
type: index
title: "Architecture Decision Records"
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-17T20:40:00Z"
tags: []
---

# Architecture Decision Records

Architecture decisions that shaped the hugging-xberg MCP server.

> **Draft note (in-repo):** ADR-0001..0003 were updated and ADR-0004/0005 added during the `hugging-kreuzberg-mcp` → `hugging-xberg-mcp` port. Promotion to the durable vault is **pending vault-keeper review** — do not self-promote.

## Nodes

- [[0001-raise-body-limit.adr]] — ADR-0001: Raise Express body limit to 50mb for base64 image/PDF payloads (env-configurable)
- [[0002-preserve-status-codes.adr]] — ADR-0002: Preserve HTTP status codes in error handler (413→413)
- [[0003-align-client-guard.adr]] — ADR-0003: Align client-side MAX_BASE64_LENGTH with server limit (48_900_000)
- [[0004-structured-extraction-via-config.adr]] — ADR-0004: Structured extraction via config.structured_extraction on /extract
- [[0005-port-hugging-kreuzberg-to-xberg.adr]] — ADR-0005: Port hugging-kreuzberg-mcp → hugging-xberg-mcp (xberg backend)
