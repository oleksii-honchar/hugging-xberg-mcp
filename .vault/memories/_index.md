---
type: index
title: "Atomic Memories"
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-21T10:59:18Z"
tags: []
---

# Atomic Memories

Gotchas, API quirks, and operational learnings for the hugging-xberg MCP server (port of the previous hugging-kreuzberg-mcp wrapper).

## Nodes

### opencode Gotchas

- [[0001-opencode-inline-base64-gotcha.memory]] — opencode inlines attachments as base64 with no size cap
- [[0004-opencode-no-retry-mcp-connection.memory]] — opencode connects to MCP servers at startup only, no retry
- [[0005-category-filter-silently-excludes.memory]] — opencode category filter silently excludes MCP servers

### LiteLLM Gotchas

- [[0002-litellm-reinit-per-operation.memory]] — LiteLLM reinitializes MCP session per operation
- [[0003-litellm-tool-name-prefixing.memory]] — LiteLLM prepends server name to MCP tool names

### Backend Gotchas

- [[0006-base64-corruption-422-errors.memory]] — Corrupted base64 → 422 ParsingError (kreuzberg-era record)

### Xberg / Port

- [[0007-wrapper-vs-direct-xberg-comparison.memory]] — Wrapper exposes 2 tools vs direct Xberg MCP (no batch/cache)
- [[0008-kreuzberg-to-xberg-migration.memory]] — Migrating `hugging_kreuzberg-*` → `hugging_xberg-*` (names, input format, schema, envelope)

### Workflows

- [[0009-chrome-devtools-ocr-workflow.memory]] — Chrome DevTools screenshot → OCR via `hugging_xberg-extract_bytes`
