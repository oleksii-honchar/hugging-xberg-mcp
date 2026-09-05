---
type: decision
id: DEC-0008
title: "Wrapper Sources Explicit-VLM Block from Existing Env Pattern"
status: accepted
createdAt: "2026-09-05T10:19:00Z"
updatedAt: "2026-09-05T10:19:00Z"
tags: [ocr, wrapper, env, pattern]
supersedes: []
superseded_by: []
see_also: ["decisions/0007-ocr-engine-knob-request-level-config.decision.md", "decisions/0009-xberg-toml-ocr-ssot.decision.md", "memories/0011-xberg-empty-env-var-crash.memory.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# DEC-0008: Wrapper Sources Explicit-VLM Block from Existing Env Pattern

## Context

When the user sets `ocr_engine=vlm`, the wrapper composes a `vlm_fallback` block that references a VLM model. The wrapper needs to know which model name to use in that block. The codebase already reads env vars in `src/xberg-client.js` (e.g., `XBERG_API_URL`), and the docker-compose already exposes `XBERG_VLM_OCR_MODEL` for deployment configuration.

## Decision

Add a `buildOcrConfig(ocrEngine)` helper in `src/xberg-client.js` that reads `XBERG_VLM_OCR_MODEL` (defaulting to a reasonable model if unset) and returns the complete `ocr` block for the given engine value. This follows the existing env-reading pattern already established in the codebase.

## Alternatives Considered

- **Read from a config file in the wrapper:** More complex; env vars are the established pattern and are already deployed in docker-compose.
- **Hardcode the model name:** Breaks the principle that xberg.toml/deployment config is the source of truth for the model.

## Consequences

- **Positive:** The VLM model name for the explicit-VLM path is deployment-configurable, consistent with existing patterns.
- **Positive:** No new configuration mechanism introduced.
- **Negative:** Two places can now reference a VLM model (xberg.toml for the default path, env for the explicit path) — see DEC-0009 for how this is reconciled.
- **Gotcha:** An empty-but-set `XBERG_VLM_OCR_MODEL` causes xberg to crash at startup (see [[memories/0011-xberg-empty-env-var-crash.memory]]).
