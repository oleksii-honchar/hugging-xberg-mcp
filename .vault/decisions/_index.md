---
type: index
title: "Architecture Decision Records"
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-09-05T10:19:00Z"
tags: []
---

# Architecture Decision Records

Architecture decisions that shaped the hugging-xberg MCP server.

> **Draft note (in-repo):** DEC-0001..0003 were updated and DEC-0004/0005 added during the `hugging-kreuzberg-mcp` → `hugging-xberg-mcp` port. Promotion to the durable vault is **pending vault-keeper review** — do not self-promote.

## Nodes

- [[0001-raise-body-limit.decision]] — DEC-0001: Raise Express body limit to 50mb for base64 image/PDF payloads (env-configurable)
- [[0002-preserve-status-codes.decision]] — DEC-0002: Preserve HTTP status codes in error handler (413→413)
- [[0003-align-client-guard.decision]] — DEC-0003: Align client-side MAX_BASE64_LENGTH with server limit (48_900_000)
- [[0004-structured-extraction-via-config.decision]] — DEC-0004: Structured extraction via config.structured_extraction on /extract
- [[0005-port-hugging-kreuzberg-to-xberg.decision]] — DEC-0005: Port hugging-kreuzberg-mcp → hugging-xberg-mcp (xberg backend)
- [[0006-vlm-fallback-native-pipeline.decision]] — DEC-0006: Use xberg-native vlm_fallback pipeline (no wrapper-side orchestration)
- [[0007-ocr-engine-knob-request-level-config.decision]] — DEC-0007: `ocr_engine` knob = complete request-level `ocr` block composition
- [[0008-wrapper-extract-env-pattern.decision]] — DEC-0008: Wrapper sources explicit-VLM block from existing env pattern
- [[0009-xberg-toml-ocr-ssot.decision]] — DEC-0009: xberg.toml single source of truth for OCR VLM model; remove env overrides
- [[0010-additive-wrapper-evolution.decision]] — DEC-0010: Additive wrapper evolution only — 2.1.0 → 2.2.0, upstream xberg pin honored
