---
type: decision
id: DEC-0011
title: "describe_image Uses xberg Captioning Pipeline, Not VLM OCR"
status: accepted
createdAt: "2026-09-14T06:33:00Z"
updatedAt: "2026-09-14T06:33:00Z"
tags: [describe_image, captioning, vlm, xberg]
supersedes: []
superseded_by: []
see_also: ["decisions/0006-vlm-fallback-native-pipeline.decision.md", "decisions/0009-xberg-toml-ocr-ssot.decision.md", "decisions/0010-additive-wrapper-evolution.decision.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# DEC-0011: describe_image Uses xberg Captioning Pipeline, Not VLM OCR

## Context

The `describe_image` tool was initially designed to use the VLM OCR backend (`ocr: { backend: 'vlm' }`). In practice, this approach produced text-extraction results (e.g., "The provided image does not contain any visible text...") rather than natural-language image descriptions. The VLM OCR backend is designed for text extraction from images — it answers "what text is in this image?" not "describe this image."

Investigation revealed that xberg v1.0.14 provides a dedicated **image captioning** feature (`config.captioning`) that is designed for VLM-powered image description and returns `results[].images[].caption` — the correct shape for our needs. The wrapper was using the wrong xberg feature for the job.

## Decision

Rewrite `describe_image` to use the xberg captioning config block instead of the VLM OCR backend:

- Config: `captioning: { llm: { model, base_url, api_key }, prompt, min_image_area }`
- Response parsing: `results[0].images[].caption` (joined)
- `min_image_area: 0` to ensure standalone images are captioned
- Reuse existing VLM configuration: `XBERG_VLM_OCR_MODEL` for model, `XBERG_LLM_BASE_URL`/`XBERG_LLM_API_KEY` for auth

## Alternatives Considered

- **Keep VLM OCR backend:** Produces text-extraction results, not image descriptions. Incorrect use case for the `describe_image` tool's purpose.
- **New xberg endpoint (`/describe`):** Would require upstream xberg changes, violating the "upstream xberg as-is" constraint (DEC-0010).
- **Wrapper-side VLM call:** Would require separate model configuration and network calls, violating the thin-wrapper principle (DEC-0006).

## Consequences

- **Positive:** The tool now returns natural-language image descriptions instead of "no text to extract" results.
- **Positive:** Uses xberg's dedicated captioning feature, which is the architecturally correct mechanism for this use case.
- **Positive:** No new endpoint or upstream changes required (honors DEC-0010).
- **Positive:** Same VLM model and authentication as the OCR fallback path (reuses existing config, honors DEC-0009).
- **Note:** The tool returns the full xberg JSON response (not parsed description text), consistent with other wrapper tools (`extract_bytes`, `extract_structured`).