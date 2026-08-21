---
type: specification
title: "Fix MCP 500 — Body Size Limit and Error Masking (kreuzberg-era historical record)"
kind: refactor
status: completed
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-17T20:40:00Z"
tags: [mcp, express, bugfix]
owner: ""
target: ""
see_also: ["adrs/0001-raise-body-limit.adr.md", "adrs/0002-preserve-status-codes.adr.md", "adrs/0003-align-client-guard.adr.md", "memories/0001-opencode-inline-base64-gotcha.memory.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Specification: Fix MCP 500 — Body Size Limit and Error Masking

> **Historical record (pre-port):** This spec documents the original kreuzberg-era fix (10mb → 20mb, `MAX_BASE64_LENGTH` 19,400,860 in `src/kreuzberg-client.js`). Since the `hugging-kreuzberg-mcp` → `hugging-xberg-mcp` port (ADR-0005) the limits are 50mb (`MCP_BODY_LIMIT`) and `MAX_BASE64_LENGTH` 48,900,000 (ADR-0001/ADR-0003). The 413→-32600 error-masking fix remains in force (ADR-0002).

## Goal

Fix HTTP 500 errors when users attach images >7.5MB: (1) express.json body limit too small for base64 payloads, (2) error handler masks 413 as 500.

## Phases

### Phase 1 — Fix (completed)
- [x] Raise `express.json` limit from 10mb to 20mb in `src/mcp-server.mjs`
- [x] Preserve HTTP status codes in error handler (413→413, else 500)
- [x] Align `MAX_BASE64_LENGTH` to 19,400,860 in `src/kreuzberg-client.js`
- [x] Build and push new Docker image

### Phase 2 — Verification (completed)
- [x] Small image (<5MB) succeeds
- [x] Large image (>10MB, <15MB) succeeds — previously failed
- [x] Oversized image (>20MB) returns 413 — previously 500

## Behaviors

- **Given** image ≤7.5MB, **when** extract_structured, **then** HTTP 200
- **Given** image 7.5–15MB, **when** extract_structured, **then** HTTP 200 — previously failed
- **Given** image >20MB, **when** extract_structured, **then** HTTP 413 with clear message — previously 500

## Risks

- **Memory pressure** (low) — 20mb is reasonable; Node.js heap handles this
- **DDoS via oversized payloads** (low) — 20mb limit still enforced

## Milestones

- 2026-08-09: Root cause identified, fix implemented, tests passing

## Links

- [[adrs/0001-raise-body-limit.adr]] — body limit increase
- [[adrs/0002-preserve-status-codes.adr]] — error handler
- [[adrs/0003-align-client-guard.adr]] — client guard alignment
- [[memories/0001-opencode-inline-base64-gotcha.memory]] — root cause
