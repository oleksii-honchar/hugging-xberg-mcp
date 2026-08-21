---
type: adr
id: ADR-0005
title: "Port hugging-kreuzberg-mcp → hugging-xberg-mcp (xberg backend)"
status: accepted
createdAt: "2026-08-17T20:40:00Z"
updatedAt: "2026-08-17T20:40:00Z"
tags: [mcp, xberg, port, rebrand]
supersedes: []
superseded_by: []
see_also: ["adrs/0001-raise-body-limit.adr.md", "adrs/0004-structured-extraction-via-config.adr.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# ADR-0005: Port hugging-kreuzberg-mcp → hugging-xberg-mcp (xberg backend)

> **Draft note (in-repo):** Added during the port. Promotion to the durable vault is **pending vault-keeper review** — do not self-promote.

## Context

The upstream Kreuzberg project rebranded to [xberg-io/xberg](https://github.com/xberg-io/xberg). The previous wrapper (`hugging-kreuzberg-mcp` v1.0.1) pointed at the olho Kreuzberg fork. This repo is the port: `hugging-xberg-mcp` v2.0.0 pointing at upstream Xberg REST (`ghcr.io/xberg-io/xberg:1.0.14`, pinned) instead of the fork. User direction: preserve the base64/data-URL/opencode flows and extend extraction to PDFs.

## Decision

- Replicate the wrapper repo as `hugging-xberg-mcp`; swap the backend client to `XBERG_API_URL` (`http://xberg:8000`), env vars renamed `KREUZBERG_*` → `XBERG_*` / `HUGGING_KREUZBERG_*` → `HUGGING_XBERG_*`.
- `extract_structured` reimplemented via `config.structured_extraction` on `/extract` (ADR-0004); `/extract-structured` removed.
- Limits raised: Express body 50mb (env `MCP_BODY_LIMIT`, ADR-0001), `MAX_BASE64_LENGTH` 48_900_000 (ADR-0003).
- `extract_bytes` extended to PDFs (MIME-agnostic client; xberg parses PDFs natively). Pagination is output-side only — `config.pages.insert_page_markers` (`<!-- PAGE {n} -->` markers), `config.chunking` (`first_page`/`last_page`), `config.force_ocr_pages`; **no** input-side page ranges.
- Response envelope is xberg `{results, errors, summary}` (`errors` omitted when empty).
- puma.lan cutover: LiteLLM `mcp_servers.hugging_xberg.url = http://hugging-xberg-mcp:3000/mcp`, Infisical path `/lite-llm/mcp/xberg`, opencode remote `hugging-xberg` with `hugging_xberg-*` enabledTools.

## Alternatives Considered

| Alternative | Pros | Cons | Why rejected |
|-------------|------|------|-------------|
| Port to xberg backend (chosen) | Native base_url/api_key support, 100+ formats incl. PDF, no fork patches | Coordinated cutover (LiteLLM/opencode/Infisical) | — |
| Extend kreuzberg wrapper in place | No cutover | Wrong branding; olho fork diverges from upstream | User wants xberg repo |
| Use native xberg MCP | No wrapper | `kind=bytes` needs raw int arrays — breaks base64/opencode flows | User constraint |

## Consequences

- **Positive:** PDF support via existing `extract_bytes`; fork patches obsolete (native in xberg)
- **Positive:** Pinned engine image (`1.0.14`) for reproducible deploys (ADR-008 in session decisions)
- **Neutral:** Client-visible tool prefixes change `hugging_kreuzberg-` → `hugging_xberg-` (coordinated in cutover)
- **Negative:** Old kreuzberg compose dir kept stopped (not deleted) for rollback
