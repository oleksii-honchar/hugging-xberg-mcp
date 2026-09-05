---
type: memory
title: "opencode Inlines Attachments as Base64 — No Size Cap"
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-09T10:59:55Z"
tags: [mcp, opencode, gotcha, base64, body-limit]
see_also: ["decisions/0001-raise-body-limit.decision.md", "specifications/0001-body-limit-fix.spec.md", "concepts/0002-opencode-attachment-uri-bridge.concept.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Memory: opencode Inlines Attachments as Base64 — No Size Cap

## Fact

opencode resolves `opencode://attachment/<uuid>` URIs in MCP tool arguments by reading the entire file via `readFileSync` and inlining the full base64 string into the JSON request body — with no client-side size cap.

## Context

Discovered during root cause investigation (session 260809-1207-kreuzberg-mcp-root-cause). A large PNG was attached, opencode inlined ~13.4MB base64, exceeding the MCP server's 10mb body limit.

Relevant code:
- `better-opencode/packages/opencode/src/session/attachment.ts` — `resolve(uri)` uses `readFileSync(path)` → `buffer.toString("base64")` with no size cap
- `better-opencode/packages/opencode/src/mcp/index.ts` — `resolveAttachmentUris(args)` replaces `opencode://attachment/<uuid>` with full base64 inline

## Impact

- MCP server body limits must account for 1.33× base64 overhead
- Current limits: Express body `MCP_BODY_LIMIT` default 50mb; `MAX_BASE64_LENGTH` 48_900_000 chars (~36.5MB raw ≈ 97% of the JSON envelope) — see DEC-0001/DEC-0003
- Any MCP server receiving opencode attachments should raise its body limit above the base64-expanded payload size and preserve HTTP 413 status
