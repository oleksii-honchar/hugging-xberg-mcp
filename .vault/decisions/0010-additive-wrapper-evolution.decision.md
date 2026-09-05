---
type: decision
id: DEC-0010
title: "Additive Wrapper Evolution Only — 2.1.0 → 2.2.0, Upstream xberg Pin Honored"
status: accepted
createdAt: "2026-09-05T10:19:00Z"
updatedAt: "2026-09-05T10:19:00Z"
tags: [api, versioning, compatibility, xberg]
supersedes: []
superseded_by: []
see_also: ["decisions/0005-port-hugging-kreuzberg-to-xberg.decision.md", "specifications/0002-cpu-first-ocr-vlm-fallback.spec.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# DEC-0010: Additive Wrapper Evolution Only — 2.1.0 → 2.2.0, Upstream xberg Pin Honored

## Context

The session constraint states: "evolve the hugging-xberg-mcp wrapper (package version 2.1.0 → 2.2.0), using upstream Xberg as-is (image pinned to 1.0.14), with no changes to upstream xberg".

This is an additive-evolution-only decision: the upstream xberg is treated as a read-only, version-pinned dependency, and all changes are confined to the wrapper.

## Decision

Implement all changes as additive evolutions to the hugging-xberg-mcp wrapper (package version 2.1.0 → 2.2.0). Do not modify, fork, or re-pin the upstream xberg (stays at 1.0.14). All functionality is added via:
- New `ocr_engine` parameter on both tools (additive to existing schema)
- New `buildOcrConfig()` helper in the client (internal change)
- Updated `xberg.toml` and `docker-compose.yml` in both deployment repos (deployment config, not xberg source)

The xberg image pin `ghcr.io/xberg-io/xberg:1.0.14` remains unchanged.

## Alternatives Considered

- **Fork or modify xberg to add native `ocr_engine` support:** Violates the "use upstream as-is" constraint; would require maintaining a fork. Rejected.
- **Re-pin xberg to a newer version with built-in engine selection:** Violates the pin constraint; would require re-validation. Rejected.

## Consequences

- **Positive:** Clean separation — xberg is a stable upstream dependency; the wrapper owns the evolution.
- **Positive:** No breaking changes to the xberg API surface; the `ocr_engine` knob is additive.
- **Positive:** The pin is honored (1.0.14) in both hugging-xberg-mcp and puma-lan docker-compose files.
- **Positive:** Backward compatible — existing callers unaffected (ocr_engine is optional).
