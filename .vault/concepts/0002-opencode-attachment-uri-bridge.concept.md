---
type: concept
title: "opencode Attachment URI Bridge"
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-21T10:59:18Z"
tags: [mcp, opencode, attachments, uri-bridge, vision]
see_also: ["memories/0001-opencode-inline-base64-gotcha.memory.md", "concepts/0004-mcp-tool-reference.concept.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Concept: opencode Attachment URI Bridge

## What

The URI bridge decouples what the LLM *sees* (an image + a short readable URI) from what the MCP tool *needs* (base64 data). opencode stores attachments as temp files and injects `opencode://attachment/<uuid>` URIs that the LLM can copy into tool arguments — a server-side interceptor resolves them back to base64.

## Why

Vision models can *see* attached images in conversation context, but they cannot *extract* the raw base64 data needed for MCP tool arguments. The LLM sees pixels — it doesn't have access to the underlying `data:image/png;base64,...` string.

## Key Details

**Flow:**
1. User attaches file → opencode stores as temp file, generates `opencode://attachment/<uuid>.<ext>` URI
2. Synthetic text part injected into prompt: `"Attached file: photo.png — use \"opencode://attachment/abc123.png\" as the data argument"`
3. LLM sees image visually AND the URI as text
4. LLM calls tool with URI: `{ data: "opencode://attachment/abc123.png" }`
5. `convertMcpTool` intercepts, reads temp file → base64, replaces URI in args
6. MCP server receives valid base64 — completely unaware of URI indirection
7. After LLM loop, `cleanup()` removes temp files

**Two-layer instruction:**
- **Layer 1 (system prompt):** Injected `## File Attachments` section (~100 tokens) explaining the URI scheme — only when attachments present
- **Layer 2 (synthetic text):** Per-attachment instructional text at point of reference

**Vision-aware:** Non-vision models get the URI but not the `FilePart` — they can still use `extract_bytes` via the URI.

## Vision Flag Check — Conditional FilePart for Non-Vision Models

Not all models support image input. A non-vision model receiving a `FilePart` with an image data URL may error or silently ignore it — wasting context tokens. opencode therefore checks vision capability before constructing a user message:

- **Source of truth:** `modalities.input.includes("image")` from models.dev, wired through to `capabilities.input.image` in `provider/provider.ts`. No separate configuration property — if a provider declares `"image"` in input modalities, the model is vision-capable.
- **Override in user config:** remove `"image"` from a model's input modalities to disable FilePart injection:
  ```jsonc
  { "my-provider": { "models": { "my-non-vision-model": { "modalities": { "input": ["text"] } } } } }
  ```
- **Implementation (`session/prompt.ts`):** at the start of `createUserMessage`, opencode fetches the model via `provider.getModel()` and derives `hasVision`. The `canModelSeeImages()` helper checks `capabilities.input.image ?? false` (defaults to `false` on lookup failure — conservative). In `resolvePart`, the `FilePart` is included only when `hasVision`; the synthetic text URI is **always** included.

| Model Type | FilePart (visual) | Synthetic Text URI | Can use extract_bytes |
|------------|-------------------|--------------------|-----------------------|
| Vision model | ✅ Included | ✅ Included | Yes |
| Non-vision model | ❌ Skipped | ✅ Included | Yes |

Verified against: opencode source (better-opencode `session/attachment.ts`, `session/prompt.ts`, `provider/provider.ts`).
