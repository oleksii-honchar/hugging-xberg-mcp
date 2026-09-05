---
type: decision
id: DEC-0001
title: "Raise Express Body Limit to 50mb for Base64 Image/PDF Payloads"
status: accepted
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-17T20:40:00Z"
tags: [mcp, express, body-limit]
supersedes: []
superseded_by: []
see_also: ["decisions/0002-preserve-status-codes.decision.md", "decisions/0003-align-client-guard.decision.md", "specifications/0001-body-limit-fix.spec.md", "memories/0001-opencode-inline-base64-gotcha.memory.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# DEC-0001: Raise Express Body Limit to 50mb for Base64 Image/PDF Payloads

> **Draft note (in-repo):** This ADR was updated during the `hugging-kreuzberg-mcp` → `hugging-xberg-mcp` port (see DEC-0005). Promotion of these edits to the durable vault is **pending vault-keeper review** — do not self-promote.

## Context

The MCP server uses `express.json({ limit: process.env.MCP_BODY_LIMIT || '50mb' })`. opencode resolves attachment URIs to inline base64 with no size cap. Base64 encoding adds ~33% overhead: 36.5MB raw → ~48.9MB base64. The port to the xberg backend (DEC-0005) extends extraction to PDFs, which are larger than photos, so the old 20mb limit capped PDFs at ~14MB raw.

**History:** This ADR originally raised the limit from 10mb to 20mb (kreuzberg era, 2026-08-09, see `specifications/0001-body-limit-fix.spec.md`). The xberg port raised it again 20mb → 50mb.

## Decision

Use `express.json({ limit: process.env.MCP_BODY_LIMIT || '50mb' })` — env-configurable, default 50mb — to accommodate base64 image and PDF payloads. xberg's own body limit defaults to 100MB (`XBERG_MAX_REQUEST_BODY_BYTES`), so the wrapper limit is the binding constraint.

## Alternatives Considered

| Alternative | Pros | Cons | Why rejected |
|-------------|------|------|-------------|
| Raise to 50mb (chosen) | Accommodates PDFs (~36.5MB raw), keeps ~1.5MB safety margin for JSON envelope | Higher memory per request (~50MB) | — |
| Raise to 100mb | Matches xberg default | Unbounded memory per request, no current need | Overkill |
| Multipart streaming | Handles arbitrarily large files | Major refactor, not needed for current PDF sizes | Out of scope |
| Keep 20mb | No change | Limits PDFs to ~14MB raw | Too small for PDFs |

## Consequences

- **Positive:** PDF attachments up to ~36.5MB raw (48_900_000 base64 chars) work correctly
- **Positive:** Limit is env-configurable (`MCP_BODY_LIMIT`)
- **Negative:** Slightly higher memory per request (~50MB)
- **Risk:** Memory pressure if many large requests arrive simultaneously (mitigated by Node.js event loop; concurrency unchanged)
