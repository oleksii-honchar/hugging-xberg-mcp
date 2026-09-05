---
type: memory
title: "Xberg /extract Per-Request OCR Config Replaces (Not Merges) Server Default"
createdAt: "2026-09-05T10:19:00Z"
updatedAt: "2026-09-05T10:19:00Z"
tags: [xberg, ocr, api, gotcha, config]
see_also: ["decisions/0007-ocr-engine-knob-request-level-config.decision.md", "specifications/0002-cpu-first-ocr-vlm-fallback.spec.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Memory: Xberg /extract Per-Request OCR Config Replaces (Not Merges) Server Default

## Fact

In Xberg v1.0.14, when a `/extract` request includes an `ocr` config block, it **replaces** the server's default OCR config wholesale — it is **not** deep-merged. A partial `ocr` block (e.g., one that sets `engines` but omits `vlm_config`) silently drops any fields not explicitly provided, including the VLM fallback model.

## Context

Verified in v1.0.14 source: `crates/xberg/src/api/handlers.rs:540` (and `:1077`):
`let final_config = request.config.unwrap_or_else(|| (*state.default_config).clone());`
When `request.config` is `Some`, the server default is discarded entirely.

## Impact

The hugging-xberg-mcp wrapper must compose a **complete** `ocr` block on every request (always including `vlm_config` for the fallback model), or quality-based VLM fallback breaks. This drove DEC-0007's "complete block for every engine value" design.
