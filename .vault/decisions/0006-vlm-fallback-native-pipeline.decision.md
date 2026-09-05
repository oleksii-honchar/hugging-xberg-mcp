---
type: decision
id: DEC-0006
title: "Use xberg-native vlm_fallback Pipeline; No Wrapper-Side Orchestration"
status: accepted
createdAt: "2026-09-05T10:19:00Z"
updatedAt: "2026-09-05T10:19:00Z"
tags: [ocr, architecture, xberg, wrapper]
supersedes: []
superseded_by: []
see_also: ["decisions/0007-ocr-engine-knob-request-level-config.decision.md", "specifications/0002-cpu-first-ocr-vlm-fallback.spec.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# DEC-0006: Use xberg-native vlm_fallback Pipeline; No Wrapper-Side Orchestration

## Context

The OCR path in hugging-xberg-mcp is currently VLM-only (single model, no confidence signal, no engine choice). The goal is a CPU-first strategy (fast/free engines by default) with quality-based fallback to VLM, plus a user-facing `ocr_engine` knob.

The Xberg v1.0.14 server API already exposes a `vlm_fallback` extraction pipeline: run the CPU engines (Tesseract/PaddleOCR), check the resulting `ocr_quality` score, and only escalate to VLM when quality is below a threshold.

Two implementation options were considered:

- **A (Native pipeline):** Configure `vlm_fallback` in `xberg.toml` + a per-request `ocr` block; xberg performs engine selection, quality check, and fallback internally.
- **B (Wrapper-side orchestration):** Wrapper calls Tesseract, checks quality, and conditionally calls VLM — duplicating xberg's internal logic.

## Decision

Use the native `vlm_fallback` pipeline (Option A). Do not reimplement engine selection, quality checking, or fallback logic in the wrapper.

## Alternatives Considered

- **Option B — Wrapper-side orchestration:** Would require the wrapper to run Tesseract, interpret `ocr_quality`, and conditionally call VLM. Duplicates xberg's internal logic, creates a dual source of truth for the quality threshold, and adds latency/orchestration bugs. Rejected.
- **Option C — Always-on dual-path:** Run both CPU engines and VLM on every request. Expensive; defeats the CPU-first cost/speed goal. Rejected.

## Consequences

- **Positive:** Single source of truth (xberg) for fallback logic; the wrapper stays thin; per-request engine selection stays in xberg (stateless for the wrapper).
- **Positive:** Quality-based fallback is transparent and consistent with xberg's design.
- **Negative:** The wrapper must compose the per-request `ocr` block correctly — see DEC-0007.
- **Negative:** Behavior depends on xberg's `vlm_fallback` internals (version-pinned at 1.0.14).
