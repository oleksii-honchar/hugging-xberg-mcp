---
type: decision
id: DEC-0002
title: "Preserve HTTP Status Codes in Error Handler"
status: accepted
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-17T20:40:00Z"
tags: [mcp, express, error-handling]
supersedes: []
superseded_by: []
see_also: ["decisions/0001-raise-body-limit.decision.md", "specifications/0001-body-limit-fix.spec.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# DEC-0002: Preserve HTTP Status Codes in Error Handler

> **Draft note (in-repo):** This ADR was updated during the `hugging-kreuzberg-mcp` → `hugging-xberg-mcp` port (see DEC-0005). Promotion of these edits to the durable vault is **pending vault-keeper review** — do not self-promote.

## Context

The Express error handler converts all errors to HTTP 500, masking body-parser's 413 "Payload Too Large". Users see "Internal Server Error" instead of the actual cause.

## Decision

Preserve `err.status` from body-parser. Return 413 with JSON-RPC code -32600 and user-friendly message for 413 errors; fall back to 500 with -32603 for other errors. The 413 message reflects the env-configurable body limit: `Payload too large — request body must be under 50MB` (limit text derived from `MCP_BODY_LIMIT`, default 50mb — see DEC-0001).

## Alternatives Considered

| Alternative | Pros | Cons | Why rejected |
|-------------|------|------|-------------|
| Preserve err.status (chosen) | Semantically correct, helps debugging | Minor breaking change for clients expecting 500 | — |
| Keep blanket 500 | No client changes | Masks real errors | Current problem |
| JSON-RPC errors only | Consistent with MCP | Loses HTTP semantics for proxies | Proxies need HTTP status |
| Custom error middleware | More control | More code, complexity | Overkill |

## Consequences

- **Positive:** Users see "Payload too large — request body must be under 50MB"
- **Positive:** LiteLLM proxy distinguishes payload errors from server errors
- **Positive:** 413 immediately indicates body size issue
- **Risk:** Clients expecting 500 for all errors may need adjustment (413 is correct per HTTP spec)
