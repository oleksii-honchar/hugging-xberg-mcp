---
type: specification
title: "CPU-First OCR with Quality-Based VLM Fallback + ocr_engine Knob"
kind: feature
status: active
createdAt: "2026-09-05T10:19:00Z"
updatedAt: "2026-09-05T10:19:00Z"
tags: [ocr, architecture, xberg, wrapper]
owner: ""
target: ""
see_also: ["decisions/0006-vlm-fallback-native-pipeline.decision.md", "decisions/0007-ocr-engine-knob-request-level-config.decision.md", "decisions/0008-wrapper-extract-env-pattern.decision.md", "decisions/0009-xberg-toml-ocr-ssot.decision.md", "decisions/0010-additive-wrapper-evolution.decision.md", "memories/0010-xberg-request-config-replace-not-merge.memory.md", "memories/0011-xberg-empty-env-var-crash.memory.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Specification: CPU-First OCR with Quality-Based VLM Fallback + ocr_engine Knob

## 1. Goal

Evolve hugging-xberg-mcp from VLM-only OCR to a **CPU-first OCR strategy**:

1. **CPU-first:** By default, extract text using lightweight CPU engines (Tesseract, PaddleOCR) — faster, cheaper, no GPU dependency.
2. **Quality-based VLM fallback:** If the CPU-engine result quality is poor (via Xberg's native `vlm_fallback` pipeline), escalate to the VLM model automatically.
3. **User knob:** Expose a single `ocr_engine` parameter (`auto`, `tesseract`, `paddleocr`, `vlm`) so users can control the backend per-request.
4. **Single source of truth:** The VLM model name is configured in `xberg.toml`, not scattered across env vars.

Implementation scope is **additive evolution only** (DEC-0010): the upstream xberg (pinned 1.0.14) is used as-is; all changes land in the wrapper (package 2.1.0 → 2.2.0).

## 2. Architecture

The system topology (MCP wrapper + Xberg server) is unchanged; the OCR changes are internal to the wrapper and its config. The full C4 diagrams live in the dedicated architecture nodes — no C4 is duplicated here:

- **Container level:** [[architectures/hugging-xberg-mcp/containers/0001-system-container.container]]
- **Component level:** [[architectures/hugging-xberg-mcp/components/0001-src-modules.component]]

**OCR-relevant changes (verified against codebase):**
- `src/xberg-client.js` — new `buildOcrConfig(ocrEngine)` helper; `processDocument`/`extractStructuredData` accept `ocrEngine`.
- `src/tools.js` — `process_document` and `extract_structured_data` expose `ocr_engine: enum([auto, tesseract, paddleocr, vlm])` (optional, default auto).
- `xberg.toml` (repo root + deployed path) — CPU-first default config (Tesseract + PaddleOCR, `vlm_fallback`).
- `docker-compose.yml` (repo + puma-lan) — `XBERG_VLM_OCR_MODEL` on wrapper service (not xberg).
- `package.json` — version 2.2.0.

## 3. Per-Request OCR Block Mapping

**Key design decision** (DEC-0007). Because Xberg **replaces** (not merges) the per-request config wholesale (verified at `api/handlers.rs:540`, see [[memories/0010-xberg-request-config-replace-not-merge.memory]]), the wrapper must send a **complete** `ocr` block on every request:

| `ocr_engine` | `ocr.engines` | `ocr.fallback_policy` | VLM used? |
|--------------|---------------|----------------------|-----------|
| `auto` (default) | `["tesseract", "paddleocr"]` | `vlm_fallback` | Yes — if quality < threshold |
| `tesseract` | `["tesseract"]` | `vlm_fallback` | Yes — if quality < threshold |
| `paddleocr` | `["paddleocr"]` | `vlm_fallback` | Yes — if quality < threshold |
| `vlm` | `["tesseract", "paddleocr", "vlm"]` | `vlm_fallback` | Always (VLM in engine list) |

## 4. Behavior

**GIVEN** the wrapper is running with `xberg.toml` configured for CPU-first (Tesseract + PaddleOCR, `vlm_fallback` policy).
**WHEN** a user calls `process_document` or `extract_structured_data` with `ocr_engine="auto"` (or omits it).
**THEN** the wrapper composes a complete `ocr` block (Tesseract + PaddleOCR + vlm_fallback) and sends it in the `/extract` request. Xberg runs the CPU engines, checks `ocr_quality`, and escalates to VLM only if quality is below the configured threshold.

**GIVEN** the user sets `ocr_engine="vlm"`.
**WHEN** a tool is invoked.
**THEN** the wrapper composes an `ocr` block including VLM as an engine, ensuring VLM is used. The VLM model name comes from `XBERG_VLM_OCR_MODEL` (env on wrapper) via `buildOcrConfig()`.

**GIVEN** the user sets `ocr_engine="tesseract"` or `"paddleocr"`.
**WHEN** a tool is invoked.
**THEN** the wrapper composes an `ocr` block restricted to that engine with vlm_fallback.

## 5. Constraints

- **Additive evolution only** (DEC-0010) — xberg image pin `ghcr.io/xberg-io/xberg:1.0.14` stays unchanged; all changes in wrapper + deployment config.
- **Wrapper stays stateless** — no new persistent state; OCR block is composed per-request.
- **No breaking changes** — `ocr_engine` is an optional parameter (backward compatible).
- **Single source of truth** (DEC-0009) — VLM model in `xberg.toml` (default path) and wrapper env (explicit-VLM path); no silent env shadowing on xberg.

## 6. Phases

### Phase 1: Xberg.toml + env var migration (deployment config)

**Goal:** Configure xberg.toml with CPU-first default and migrate `XBERG_VLM_OCR_MODEL` off the xberg service.

1.1 Update `xberg.toml` with CPU-first OCR config (Tesseract + PaddleOCR, `vlm_fallback`, explicit `[ocr.vlm_config]`).
1.2 Remove `XBERG_VLM_OCR_MODEL` from the xberg service in `docker-compose.yml` (hugging-xberg-mcp + puma-lan).
1.3 Expose `XBERG_VLM_OCR_MODEL` on the wrapper service in both docker-compose.yml files.

**Verification:** xberg container starts with the new config; no env var on xberg service; wrapper receives the VLM model env.

### Phase 2: OCR engine knob in wrapper (API evolution)

**Goal:** Add the `ocr_engine` parameter and complete `ocr` block composition.

2.1 Add `ocr_engine` parameter to `process_document` and `extract_structured_data` in `src/tools.js` (Zod enum, optional, default auto).
2.2 Add `buildOcrConfig(ocrEngine)` helper in `src/xberg-client.js` (reads `XBERG_VLM_OCR_MODEL`, returns complete block).
2.3 Wire `ocr_engine` through `processDocument`/`extractStructuredData` → `POST /extract` with the composed `ocr` block.

**Verification:** MCP tool schema includes `ocr_engine`; invoking with each value sends the correct `ocr` block.

### Phase 3: End-to-end verification

3.1 Test `ocr_engine=auto` → CPU-first + quality-based VLM fallback (check `ocr` field in response).
3.2 Test `ocr_engine=vlm` → VLM used (check `ocr` field).
3.3 Test `ocr_engine=tesseract` / `paddleocr` → single engine.
3.4 Bump package version to 2.2.0.

## 7. Risks

- **Empty env var crashes xberg** — a set-but-empty `XBERG_VLM_OCR_MODEL` on xberg fails startup ([[memories/0011-xberg-empty-env-var-crash.memory]]). Mitigated by removing it from the xberg service.
- **Replace-not-merge semantics** — a partial `ocr` block silently drops VLM fallback ([[memories/0010-xberg-request-config-replace-not-merge.memory]]). Mitigated by always composing a complete block (DEC-0007).
- **Two VLM model references** — xberg.toml (default) vs wrapper env (explicit). Mitigated by documenting both in DEC-0009 and the puma-lan concept.
