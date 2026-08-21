---
type: runbook
title: "Deploy hugging-xberg-mcp Stack (Docker Compose + LiteLLM)"
createdAt: "2026-08-21T10:59:18Z"
updatedAt: "2026-08-21T10:59:18Z"
tags: [operations, deployment, docker, litellm]
see_also: ["architectures/hugging-xberg-mcp/containers/0001-system-container.container.md", "runbooks/0001-restart-mcp-stack-puma.runbook.md", "adrs/0001-raise-body-limit.adr.md", "adrs/0004-structured-extraction-via-config.adr.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Runbook: Deploy hugging-xberg-mcp Stack (Docker Compose + LiteLLM)

Deployment of the two-service stack (xberg backend + MCP wrapper) on the `puma-net` network, plus the LiteLLM gateway wiring.

## Prerequisites

- Docker + docker compose on the host (puma.lan in production)
- LiteLLM proxy reachable from the network (`http://lite-llm:4000`)
- Secrets available via Infisical (prod path `/lite-llm/mcp/xberg`) — **no `.env` files** in production

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `XBERG_API_URL` | Xberg REST API URL | `http://xberg:8000` |
| `MCP_PORT` | Port for MCP server | `3000` |
| `MCP_BODY_LIMIT` | Express JSON body limit | `50mb` |
| `LOG_LEVEL` | Logging level (`debug` or any other value) | `info` |
| `LITELLM_API_KEY` | API key for LLM (structured extraction + Xberg VLM OCR) | — |
| `XBERG_LLM_BASE_URL` | LLM base URL for structured extraction | — |
| `XBERG_LLM_MODEL` | LLM model for structured extraction | — |
| `XBERG_VLM_OCR_MODEL` | VLM OCR model for Xberg (consumed by the xberg container, not the wrapper) | — |
| `HUGGING_XBERG_STRUCTURED_SCHEMA_NAME` | Schema name for structured extraction | `extraction` |
| `HUGGING_XBERG_STRUCTURED_SCHEMA_DESCRIPTION` | Schema description | — |
| `HUGGING_XBERG_STRUCTURED_PROMPT` | Custom prompt | — |
| `HUGGING_XBERG_STRUCTURED_STRICT` | Strict mode (`true`/`false`) | `false` |

## Steps

### 1. Docker Compose (recommended)

Two services on the `puma-net` network:

```yaml
name: xberg-mcp
services:
  xberg:
    image: ghcr.io/xberg-io/xberg:1.0.14
    environment:
      - XBERG_VLM_OCR_MODEL=${XBERG_VLM_OCR_MODEL}
      - XBERG_LLM_BASE_URL=http://lite-llm:4000/v1
      - XBERG_LLM_MODEL=${XBERG_LLM_MODEL}
      - XBERG_LLM_API_KEY=${LITELLM_API_KEY}
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:8000/health"]

  hugging-xberg-mcp:
    build: .
    environment:
      - XBERG_API_URL=http://xberg:8000
      - XBERG_LLM_BASE_URL=http://lite-llm:4000/v1
      - XBERG_LLM_MODEL=${XBERG_LLM_MODEL}
      - LITELLM_API_KEY=${LITELLM_API_KEY}
    depends_on:
      xberg:
        condition: service_healthy
networks:
  puma-net:
    external: true
```

> **Important:** Neither service has a host port mapping. The MCP server is only reachable through LiteLLM's internal Docker network proxy. **Do not add `ports:` mappings** — they're not needed and would expose the server directly, bypassing LiteLLM's auth layer.

### 2. LiteLLM Configuration

```yaml
# LiteLLM config.yaml
mcp_servers:
  hugging_xberg:
    url: "http://hugging-xberg-mcp:3000/mcp"
```

LiteLLM proxies requests from `https://lite-llm.lan/mcp/hugging_xberg` to the upstream MCP server, prefixing client-visible tool names as `hugging_xberg-*` (see [[memories/0003-litellm-tool-name-prefixing.memory]]).

### 3. Structured Extraction Schema Override (optional)

The default schema is in `src/structured-schema.json`. Override at runtime by mounting a custom schema:

```yaml
volumes:
  - ./my-schema.json:/app/src/structured-schema.json:ro
```

The schema is forwarded to Xberg as `config.structured_extraction.schema` on `/extract` (ADR-0004).

## Verification

- `docker ps` shows both `xberg` and `hugging-xberg-mcp` up (xberg healthy)
- `curl -v https://lite-llm.lan/mcp/hugging_xberg -H 'Authorization: Bearer YOUR_API_KEY' -H 'Accept: application/json, text/event-stream'` returns HTTP 406 (server responding)
- Run the test runbook: [[0003-test-mcp-server.runbook]]

## Rollback

- Use the restart runbook's pre-port rollback (old `hugging-kreuzberg` compose dir kept stopped) — see [[0001-restart-mcp-stack-puma.runbook]] and ADR-0005
