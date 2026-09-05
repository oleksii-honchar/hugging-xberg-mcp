---
type: decision
id: DEC-0003
title: "Align Client-Side Size Guard with Server Limit"
status: accepted
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-17T20:40:00Z"
tags: [mcp, client, body-limit]
supersedes: []
superseded_by: []
see_also: ["decisions/0001-raise-body-limit.decision.md", "specifications/0001-body-limit-fix.spec.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# DEC-0003: Align Client-Side Size Guard with Server Limit

> **Draft note (in-repo):** This ADR was updated during the `hugging-kreuzberg-mcp` → `hugging-xberg-mcp` port (see DEC-0005). Promotion of these edits to the durable vault is **pending vault-keeper review** — do not self-promote.

## Context

`MAX_BASE64_LENGTH` in `xberg-client.js` must be aligned with the server body limit so the client guard triggers before (or at the same point as) body-parser's 413. The xberg port raised the server limit to 50mb (DEC-0001) to accommodate PDFs.

**History:** Originally aligned to 10,200,060 chars against a 10mb limit; raised to 19,400,860 against the 20mb limit (kreuzberg era); raised again to 48,900,000 against the 50mb limit (xberg port).

## Decision

Update `MAX_BASE64_LENGTH` to **48,900,000 chars** (~36.5MB raw) to align with the 50mb server limit, keeping the ~1.5MB safety margin for the JSON envelope.

## Alternatives Considered

| Alternative | Pros | Cons | Why rejected |
|-------------|------|------|-------------|
| Align with server (chosen) | Consistent limits | Guard runs after body-parser | — |
| Remove guard entirely | Less code | Loses defense-in-depth | Not enough |
| Keep old value (19,400,860) | No changes | Misleading, rejects valid PDFs | Wrong value |

## Consequences

- **Positive:** Consistent limits across client and server (50mb / 48,900,000 chars)
- **Positive:** Defense-in-depth if body-parser configuration changes
- **Neutral:** Guard still runs after body-parser (belt-and-suspenders)
