---
type: decision
id: DEC-0007
title: "ocr_engine Knob = Complete Request-level ocr Block Composition"
status: accepted
createdAt: "2026-09-05T10:19:00Z"
updatedAt: "2026-09-05T10:19:00Z"
tags: [ocr, api, xberg, wrapper]
supersedes: []
superseded_by: []
see_also: ["decisions/0006-vlm-fallback-native-pipeline.decision.md", "decisions/0008-wrapper-extract-env-pattern.decision.md", "memories/0010-xberg-request-config-replace-not-merge.memory.md", "specifications/0002-cpu-first-ocr-vlm-fallback.spec.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# DEC-0007: ocr_engine Knob = Complete Request-level ocr Block Composition

## Context

The user wants a single `ocr_engine` parameter on `process_document` and `extract_structured_data` with values `auto`, `tesseract`, `paddleocr`, `vlm`. The `ocr_engine` value must control the backend, and `auto` must trigger the quality-based VLM fallback.

The Xberg server API supports **per-request config override** via a top-level `ocr` field in the `/extract` JSON body. Verified behavior in v1.0.14 source (`api/handlers.rs:540` → `let final_config = request.config.unwrap_or_else(|| state.default_config.clone())`): when a request includes an `ocr` block, it **replaces** the server's default config wholesale — it is **not merged**.

## Decision

The wrapper implements `ocr_engine` by composing a **complete** `ocr` block on every request (when a value is provided). The block always includes the VLM model name and the fallback policy:

| `ocr_engine` | `ocr.engines` | `ocr.fallback_policy` |
|--------------|---------------|----------------------|
| `auto` (default) | `["tesseract", "paddleocr"]` | `vlm_fallback` |
| `tesseract` | `["tesseract"]` | `vlm_fallback` |
| `paddleocr` | `["paddleocr"]` | `vlm_fallback` |
| `vlm` | `["tesseract", "paddleocr", "vlm"]` | `vlm_fallback` |

The composed block is sent as the top-level `ocr` field in the `/extract` request body.

## Alternatives Considered

- **Omit `ocr` for `auto`, rely on `xberg.toml` default:** Would only work for the default case. Because xberg replaces (not merges) the per-request config, omitting `ocr` for `auto` but sending a partial `ocr` for other engines would cause inconsistent VLM availability. Sending a complete block for every engine value is simpler and consistent.
- **Use xberg config merge (if it exists):** Verified it does not in v1.0.14 — per-request config is a wholesale replacement.

## Consequences

- **Positive:** Single knob controls the full backend; `auto` gives CPU-first with quality-based VLM fallback.
- **Positive:** Consistent VLM availability across all engine values (VLM model always known to the request).
- **Negative:** The wrapper must always compose a complete block; a partial block would break VLM fallback (see [[memories/0010-xberg-request-config-replace-not-merge.memory]]).
- **Neutral:** The `ocr` block in the request is now the authoritative config for the OCR pipeline, overriding `xberg.toml`.
