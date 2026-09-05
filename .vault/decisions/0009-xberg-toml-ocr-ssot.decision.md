---
type: decision
id: DEC-0009
title: "xberg.toml Single Source of Truth for OCR VLM Model; Remove Env Overrides"
status: accepted
createdAt: "2026-09-05T10:19:00Z"
updatedAt: "2026-09-05T10:19:00Z"
tags: [ocr, config, xberg, deployment]
supersedes: []
superseded_by: []
see_also: ["decisions/0006-vlm-fallback-native-pipeline.decision.md", "decisions/0007-ocr-engine-knob-request-level-config.decision.md", "memories/0011-xberg-empty-env-var-crash.memory.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# DEC-0009: xberg.toml Single Source of Truth for OCR VLM Model; Remove Env Overrides

## Context

The `xberg.toml` configuration is currently set with:
- `[ocr.vlm_config]` using model `puma-qwopus3.5-9b-instruct` (VLM backend, 16384 context)
- No `vlm_fallback` configuration (currently VLM-only via `XBERG_VLM_OCR_MODEL` env var)

The new architecture requires `vlm_fallback` pipeline with CPU-first engines. The model must be configured in `xberg.toml` for the default/auto path, and env overrides must be removed to prevent silent shadowing of the toml config.

## Decision

1. **Update `xberg.toml`** to configure the CPU-first OCR strategy as the default:
   - Add `[ocr]` section with `engines = ["tesseract", "paddleocr"]`, `fallback_policy = "vlm_fallback"`, and an explicit `[ocr.vlm_config]` block.
   - Use the model from the existing puma-lan deployment config, but switch from VLM to `puma-qwen3.5-2b-instruct` per the CPU-first strategy.

2. **Remove the `XBERG_VLM_OCR_MODEL` env var** from the xberg service in both docker-compose.yml files (hugging-xberg-mcp and puma-lan). This ensures the toml is the single source of truth and no env override silently shadows it.

3. **Expose `XBERG_VLM_OCR_MODEL` on the wrapper service** (not xberg) so the wrapper can build the explicit-VLM `ocr` block when `ocr_engine=vlm`. The xberg.toml default covers the auto/fallback path; the env var on the wrapper covers the explicit VLM path.

## Alternatives Considered

- **Keep the env var as the model source and reference it in toml:** xberg.toml cannot read env vars for config values; the model must be explicit in the toml file.
- **Leave both env and toml configured:** Risky — env overrides toml, and a stale env var would silently use the wrong model.

## Consequences

- **Positive:** Single source of truth (xberg.toml) for the default OCR VLM model; no silent env shadowing.
- **Positive:** The CPU-first strategy is the default for all OCR requests unless the user opts into `vlm`.
- **Positive:** The explicit-VLM path (`ocr_engine=vlm`) is independently configurable via the wrapper's env.
- **Gotcha:** Must ensure the env var is not set-but-empty on xberg, as this crashes the service at startup (see [[memories/0011-xberg-empty-env-var-crash.memory]]).
