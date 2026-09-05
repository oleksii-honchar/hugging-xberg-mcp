---
type: concept
title: "PDF Support & Output-Side Pagination"
createdAt: "2026-08-21T10:59:18Z"
updatedAt: "2026-08-21T10:59:18Z"
tags: [xberg, pdf, pagination, config]
see_also: ["concepts/0004-mcp-tool-reference.concept.md", "decisions/0005-port-hugging-kreuzberg-to-xberg.decision.md", "architectures/hugging-xberg-mcp/components/0001-src-modules.component.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Concept: PDF Support & Output-Side Pagination

## What

`extract_bytes` is MIME-agnostic — PDF base64/data-URL payloads are decoded and POSTed to Xberg, which parses PDFs natively (100+ file formats). Pagination is **output-side only**: Xberg does **not** support input-side page ranges (you cannot request "pages 3–5 only" as input).

## Why

The xberg port (DEC-0005) extended extraction to PDFs without new MCP surface: the existing `extract_bytes` tool handles them through the `config` passthrough. Output-side pagination keeps the LLM's context usable by marking page boundaries and chunking long documents.

## Key Details

Pass config keys through the `config` argument of `extract_bytes`:

- `config.pages.insert_page_markers: true` — inserts `<!-- PAGE {n} -->` markers between pages.
  ⚠️ **Use `pages` (plural). A top-level `page` key is rejected by Xberg with HTTP 400 `ValidationError: unknown field page`.**
- `config.chunking: { "max_characters": 2000 }` — chunks output, each carrying `first_page`/`last_page` metadata.
- `config.force_ocr_pages: [1, 2]` (1-indexed) — force OCR for specific pages (useful for scanned pages Xberg might otherwise text-extract incorrectly).

**Example (PDF with page markers):**

```json
{
  "data": "data:application/pdf;base64,...",
  "config": {
    "pages": { "insert_page_markers": true }
  }
}
```

## Notes

- Page markers are output-side: they annotate Xberg's parsed text; they do not filter pages.
- See [[concepts/0004-mcp-tool-reference.concept]] for the full `extract_bytes` input reference.
