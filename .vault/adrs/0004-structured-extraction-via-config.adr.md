---
type: adr
id: ADR-0004
title: "Structured Extraction via config.structured_extraction on /extract"
status: accepted
createdAt: "2026-08-17T20:40:00Z"
updatedAt: "2026-08-17T20:40:00Z"
tags: [mcp, xberg, structured-extraction, extract]
supersedes: []
superseded_by: []
see_also: ["adrs/0005-port-hugging-kreuzberg-to-xberg.adr.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# ADR-0004: Structured Extraction via config.structured_extraction on /extract

> **Draft note (in-repo):** Added during the `hugging-kreuzberg-mcp` → `hugging-xberg-mcp` port (see ADR-0005). Promotion to the durable vault is **pending vault-keeper review** — do not self-promote.

## Context

The old kreuzberg backend exposed a dedicated `/extract-structured` endpoint. The xberg backend (v5) has **no** `/extract-structured` endpoint (verified against `router.rs`). Structured extraction exists as `StructuredExtractionConfig` — `schema`, `schema_name`, `schema_description`, `strict`, `prompt`, `llm{model, api_key, base_url}` — driven through the `/extract` `config` JSON.

## Decision

Reimplement `extract_structured` by POSTing to `/extract` (the same endpoint as `extract_bytes`) with a multipart `config` JSON containing `structured_extraction`. Map the old form fields onto `config.structured_extraction`:

| Old form field | New config JSON path |
|----------------|----------------------|
| `schema` | `config.structured_extraction.schema` (JSON Schema value, from `structured-schema.json`) |
| `schema_name` | `config.structured_extraction.schema_name` |
| `schema_description` | `config.structured_extraction.schema_description` |
| `prompt` | `config.structured_extraction.prompt` |
| `strict` | `config.structured_extraction.strict` |
| `model` / `base_url` / `api_key` | `config.structured_extraction.llm.{model, base_url, api_key}` |

`ENDPOINTS` now contains only `EXTRACT: '/extract'`; the `/extract-structured` path is removed. The MCP tool `extract_structured` and its zod schema are unchanged.

## Alternatives Considered

| Alternative | Pros | Cons | Why rejected |
|-------------|------|------|-------------|
| Config-driven on /extract (chosen) | Only endpoint xberg has; reuses engine | Response envelope changes vs old endpoint | — |
| Drop the tool | Less code | opencode actively enables it | Breaking |
| Keep calling /extract-structured | No client change | Endpoint does not exist in xberg | Impossible |

## Consequences

- **Positive:** `extract_structured` keeps working against xberg with the same MCP surface
- **Positive:** Schema/mapping verified by unit test (mocked fetch asserts `/extract` + `structured_extraction`)
- **Neutral:** Response envelope is now xberg `{results, errors, summary}` (`errors` omitted when empty) instead of the old endpoint output — LLM-visible
