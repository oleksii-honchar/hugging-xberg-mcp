---
type: memory
title: "Wrapper vs Direct Xberg MCP — Tool Surface Comparison"
createdAt: "2026-08-21T10:59:18Z"
updatedAt: "2026-08-21T10:59:18Z"
tags: [xberg, mcp, comparison, tools]
see_also: ["adrs/0005-port-hugging-kreuzberg-to-xberg.adr.md", "concepts/0004-mcp-tool-reference.concept.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Memory: Wrapper vs Direct Xberg MCP — Tool Surface Comparison

## Fact

hugging-xberg-mcp exposes a deliberately narrower tool surface than the direct Xberg MCP server:

| Direct Xberg MCP | hugging-xberg-mcp | Notes |
|------------------|-------------------|-------|
| `xberg-extract` | `extract_bytes` | Takes base64/data URL instead of raw byte arrays |
| `xberg-extract` with structured config | `extract_structured` | Schema configured server-side |
| `xberg-extract_batch` | — | Not exposed by wrapper |
| `xberg-cache_*` | — | Not exposed by wrapper |

**Key differences:**
1. **`extract_bytes` takes base64 or data URL** — Xberg's native MCP `kind=bytes` requires raw int arrays; the wrapper instead accepts base64-encoded file data, which works with opencode's attachment flows.
2. **Data URL support** — both wrapper tools accept either raw base64 or full data URLs (`data:image/png;base64,...`); the server converts transparently.
3. **`extract_structured` is server-configured** — schema and model are set via environment variables on the server side, not passed per-call; the tool only takes `data` (ADR-0004).
4. **Fewer tools** — only the two extraction tools; `extract_batch` and cache tools are not available.

## Context

Design rationale from the wrapper docs and the port decision (ADR-0005): the wrapper exists precisely because the native Xberg MCP interface is incompatible with opencode's base64/URI attachment model.

## Impact

- If a workflow needs batch extraction or cache tools, the wrapper cannot serve it — use the direct Xberg MCP server instead.
- Don't pass raw byte arrays or per-call schemas to the wrapper tools; use base64/data URL and rely on server-side config.
