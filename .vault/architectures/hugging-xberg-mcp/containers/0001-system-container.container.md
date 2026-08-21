---
type: container
title: "hugging-xberg-mcp — Container Level"
c4_level: container
system: hugging-xberg-mcp
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-17T20:40:00Z"
tags: [mcp, container, c4]
see_also: ["concepts/0001-mcp-streamable-http-stateless.concept.md", "memories/0002-litellm-reinit-per-operation.memory.md", "adrs/0001-raise-body-limit.adr.md", "adrs/0002-preserve-status-codes.adr.md", "adrs/0005-port-hugging-kreuzberg-to-xberg.adr.md"]
linked_elements: ["mcp-client", "mcp-server", "xberg-api", "litellm-proxy", "caddy-proxy"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Container: hugging-xberg-mcp — System

> **Draft note (in-repo):** Rebranded during the `hugging-kreuzberg-mcp` → `hugging-xberg-mcp` port (ADR-0005). Promotion to the durable vault is **pending vault-keeper review** — do not self-promote.

## Diagram

```mermaid
C4Container
  title hugging-xberg-mcp — System Container Level

  Person(client, "MCP Client", "opencode user — calls extract_bytes and extract_structured tools")

  Boundary(external, "External Systems", "Boundary") {
    System_Ext(caddy, "Caddy", "Reverse proxy with internal TLS (self-signed CA)", "tls internal")
    System_Ext(litellm, "LiteLLM Proxy", "MCP gateway — reinitializes per operation, prefixes tool names", ":4000")
  }

  Boundary(mcp-system, "hugging-xberg-mcp", "Boundary") {
    Container(mcp-server, "hugging-xberg-mcp", "Node.js 24 / Express / MCP SDK", "Wrapper MCP server — Streamable HTTP on :3000, stateless, 50mb body limit", "vault_link: adrs/0001-raise-body-limit.adr.md")
    Container_Ext(xberg-api, "Xberg API", "Rust REST server", "Document extraction — OCR + PDF parsing + structured extraction on :8000", "vault_link: adrs/0004-structured-extraction-via-config.adr.md")
  }

  Rel(client, caddy, "HTTPS + Bearer token", "POST /mcp/hugging_xberg")
  Rel(caddy, litellm, "MCP proxy", "Streamable HTTP")
  Rel(litellm, mcp-server, "MCP proxy", "POST /mcp on :3000")
  Rel(mcp-server, xberg-api, "HTTP", "POST /extract on :8000")
```

## Elements

| ID | Name | Type | Technology | Description |
|----|------|------|-----------|-------------|
| `client` | MCP Client | Person | — | opencode user calling extract_bytes and extract_structured |
| `caddy` | Caddy | System_Ext | Caddy | Reverse proxy with internal TLS (self-signed CA) |
| `litellm` | LiteLLM Proxy | System_Ext | Python | MCP gateway — reinitializes per operation, prefixes tool names |
| `mcp-server` | hugging-xberg-mcp | Container | Node.js 24 / Express / MCP SDK | Wrapper MCP server — Streamable HTTP on :3000, stateless, 50mb body limit |
| `xberg-api` | Xberg API | Container_Ext | Rust REST server | Document extraction — OCR + PDF parsing + structured extraction on :8000 |

## Notes

- **No host port mapping** — mcp-server runs on :3000 inside Docker, NOT exposed to host; only reachable through LiteLLM
- **Stateless transport** — `sessionIdGenerator: undefined`, fresh McpServer per request (see [[concepts/0001-mcp-streamable-http-stateless.concept]])
- **Body limit** — 50mb (env `MCP_BODY_LIMIT`) to accommodate base64 images/PDFs (see [[adrs/0001-raise-body-limit.adr]])
- **Error handling** — Preserves HTTP 413 for payload-too-large (see [[adrs/0002-preserve-status-codes.adr]])
- **Structured extraction** — config-driven via `config.structured_extraction` on `/extract`; no `/extract-structured` (see [[adrs/0004-structured-extraction-via-config.adr]])
- **LiteLLM reinitializes per operation** — every operation calls initialize (see [[memories/0002-litellm-reinit-per-operation.memory]])
- **Tool name prefixing** — LiteLLM prepends `hugging_xberg-` to tool names
- **Port history** — this system was previously `hugging-kreuzberg-mcp` (see [[adrs/0005-port-hugging-kreuzberg-to-xberg.adr]])
