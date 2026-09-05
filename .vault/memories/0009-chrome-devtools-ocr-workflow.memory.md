---
type: memory
title: "Chrome DevTools Screenshot → OCR Workflow"
createdAt: "2026-08-21T10:59:18Z"
updatedAt: "2026-08-21T10:59:18Z"
tags: [workflow, chrome-devtools, ocr, screenshots]
see_also: ["concepts/0004-mcp-tool-reference.concept.md", "concepts/0002-opencode-attachment-uri-bridge.concept.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Memory: Chrome DevTools Screenshot → OCR Workflow

## Fact

Text can be extracted from browser screenshots in two steps, no conversion needed:

1. Take a screenshot with chrome-devtools-mcp:
   `chrome_devtools-take_screenshot() → { data: "iVBORw..." }`
2. Pass the base64 data directly to the OCR tool:
   `hugging_xberg-extract_bytes(data: "iVBORw...")`

The chrome-devtools screenshot returns raw base64 data, which the OCR tool accepts directly.

## Context

Documented in the opencode integration docs as a practical pipeline for reading rendered pages (e.g., dashboards, PDF viewers, paywalled content rendered in a browser).

## Impact

- Useful pattern whenever content is only accessible as a rendered browser view.
- Note the size limits still apply (base64 ≤ 48_900_000 chars / ~36.5MB raw — see DEC-0001/DEC-0003).
