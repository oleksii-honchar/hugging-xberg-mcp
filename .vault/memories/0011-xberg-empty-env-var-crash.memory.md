---
type: memory
title: "Xberg serve Crashes on Set-but-Empty XBERG_VLM_OCR_MODEL"
createdAt: "2026-09-05T10:19:00Z"
updatedAt: "2026-09-05T10:19:00Z"
tags: [xberg, env, deployment, gotcha, ocr]
see_also: ["decisions/0009-xberg-toml-ocr-ssot.decision.md", "decisions/0008-wrapper-extract-env-pattern.decision.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Memory: Xberg serve Crashes on Set-but-Empty XBERG_VLM_OCR_MODEL

## Fact

In Xberg v1.0.14, if the `XBERG_VLM_OCR_MODEL` environment variable is **set but empty**, `xberg serve` returns a validation error (`"XBERG_VLM_OCR_MODEL must not be empty"`) and fails to start. An **unset** variable is fine; a **set-and-empty** one crashes.

## Context

Verified in v1.0.14 source: `crates/xberg/src/core/config/extraction/env.rs:320-326`:
`if let Ok(value) = std::env::var("XBERG_VLM_OCR_MODEL") { if value.is_empty() { return Err(XbergError::Validation { message: "XBERG_VLM_OCR_MODEL must not be empty", ... }) } }`

## Impact

When relocating `XBERG_VLM_OCR_MODEL` from the xberg service to the wrapper service (DEC-0009), the env var must be fully **removed** from the xberg service definition in docker-compose.yml — not left set-but-empty. A leftover empty value would crash the xberg container at startup.
