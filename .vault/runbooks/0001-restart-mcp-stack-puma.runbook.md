---
type: runbook
title: "Restart MCP Stack on puma.lan"
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-17T20:40:00Z"
tags: [operations, puma, deployment]
see_also: ["memories/0004-opencode-no-retry-mcp-connection.memory.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Runbook: Restart MCP Stack on puma.lan

> **Draft note (in-repo):** Rebranded during the `hugging-kreuzberg-mcp` → `hugging-xberg-mcp` port (DEC-0005). Promotion to the durable vault is **pending vault-keeper review** — do not self-promote. The puma deployment lives in `lite-llm/mcp/hugging-xberg/` (old `hugging-kreuzberg/` dir kept stopped for rollback).

## Prerequisites

- SSH access to puma.lan (tuiteraz@puma.lan)
- Docker running on puma.lan

## Steps

1. **Check current state:**
   ```bash
   ssh tuiteraz@puma.lan "docker ps --filter 'name=hugging-xberg'"
   # Expected: both hugging-xberg-mcp AND xberg up and healthy
   ```

2. **Restart the MCP stack:**
   ```bash
   ssh tuiteraz@puma.lan "cd ~/hugging-xberg-mcp && docker compose down && docker compose up -d"
   ```

3. **Wait for health check:**
   ```bash
   ssh tuiteraz@puma.lan "docker ps --filter 'name=hugging-xberg' | grep healthy"
   ```

4. **Verify connectivity:**
   ```bash
   curl -v https://lite-llm.lan/mcp/hugging_xberg \
     -H 'Authorization: Bearer YOUR_API_KEY' \
     -H 'Accept: application/json, text/event-stream'
   # Expected: HTTP 406 (Not Acceptable) — means server IS responding
   ```

5. **Restart opencode** — it connects to MCP servers at startup only; restart to reconnect:
   ```bash
   # Close and reopen opencode
   ```

## Verification

- `docker ps --filter 'name=hugging-xberg'` shows both containers healthy
- `curl -v` to MCP endpoint returns HTTP 406 (server responding)
- `opencode mcp list` shows hugging-xberg as "connected"
- Tools `hugging_xberg-extract_bytes` and `hugging_xberg-extract_structured` appear in agent toolset

## Rollback

- If restart fails, check logs: `ssh tuiteraz@puma.lan "docker logs hugging-xberg-mcp --tail 50"`
- Restart LiteLLM if proxy config changed: `ssh tuiteraz@puma.lan "docker restart /lite-llm"`
- Full restart: `docker compose down && docker compose up -d` again, then verify steps above
- Pre-port rollback: the old `lite-llm/mcp/hugging-kreuzberg/` compose dir is kept stopped — re-enable it and revert `config.yaml`/`opencode.jsonc` (see DEC-0005)
