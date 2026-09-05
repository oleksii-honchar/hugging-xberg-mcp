> Shared conventions (prerequisites, MCP-only, bound tools, envelope assertions, cleanup): see the xberg-mcp-agentic-testing skill (SKILL.md §Runbook Conventions). This runbook is **MCP-only** — every step goes through the **bound** `extract_bytes` tool via `meta_use`; no raw HTTP, no wire probes (those live in the scripts: `test.sh` / `test-remote.sh` only).

# Agent e2e test

## Extract bytes scenario

### Test Objective

Verify the **bound `extract_bytes` tool** end-to-end (cases A1–A4, B1–B4, C1–C4, D1–D5): basic extraction from images and PDFs, OCR paths (default CPU Tesseract; VLM only on low-quality fallback or explicit `ocr_engine=vlm`), error/edge paths, and config-flag behavior (page markers + the singular-`page` typo guard + the `disable_ocr` timeout-recovery flag).

> **Remote target:** steps reference the **bound tool** — the remote `extract_bytes` confirmed at Setup (`hugging-xberg_hugging_xberg-extract_bytes`; opencode prefixes by entry name `hugging-xberg_` + LiteLLM upstream server `hugging_xberg`). Confirm the exact remote name at Setup; never hardcode a bare name.
>
> **Envelope convention:** parse the tool's text result as JSON — `{results, errors, summary}`. The `errors` key is **omitted when empty** — treat a missing `errors` as `[]`.
>
> **OCR content assertions:** the default OCR engine is **CPU Tesseract** (deterministic on clean pages — exact-text assertions are viable). For the VLM-fallback / explicit-`ocr_engine=vlm` path, use **shape-based** (envelope + non-empty) — VLM output is non-deterministic.
>
> **LLM Setup Prerequisite (ADR-014):** the Setup LLM probe (one cheap structured/OCR call) confirms VLM reachability. Since the default OCR engine is now **CPU Tesseract**, OCR cases in this runbook do **not** require the VLM and can **PASS even when the probe fails**. The LLM probe gates only cases that explicitly use `ocr_engine=vlm` or a confirmed low-quality VLM fallback — report the exact vars to fix (`XBERG_LLM_BASE_URL`, `ocr.vlm_config.base_url`, `LITELLM_API_KEY`) if such cases are blocked.

### Prerequisites

- The **bound remote tool** is established (transport runbook F1 passed, or Setup Phase 1 completed): `meta_search("xberg")` shows the 2 remote xberg tools under the `hugging-xberg_hugging_xberg-*` prefix; that is the bound `extract_bytes`.
- The stack is running for the active environment (Setup Phase 1 step 3).
- Fixtures available at the repo root:
  - `fixtures/test-image.png` — PNG screenshot (1806×844, contains text).
  - `fixtures/multi-page.pdf` — 2-page **text-layer** PDF.
- Portable base64 helper (macOS BSD + GNU Linux) for payload computation in bash:
  - `b64() { base64 < "$1" | tr -d '\n'; }`
  - Resolve `fixtures/` from the repo root (`cd` there first if needed).
- Setup LLM probe status is recorded (ADR-014) — it gates only cases that explicitly use `ocr_engine=vlm` or a confirmed VLM fallback; default-OCR (CPU Tesseract) cases run regardless.

### Test Steps

#### Step 1 (A1): PNG image — raw base64 extraction

- **Input:** `data` = `(b64 fixtures/test-image.png)` computed with the `b64()` helper (no `data:` prefix), `mime_type: "image/png"`.
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS:** valid envelope — JSON with `results` non-empty; `results[0].content` non-empty (extracted text from the image); `errors` absent (⇒ `[]`) or empty.
- **FAIL signature:** connection-layer failure, or empty `results`/`content`, or non-empty `errors`.
- **LLM-dependent:** the default OCR engine is **CPU Tesseract** (no VLM needed for clean pages) — this case can **PASS even when the Setup LLM probe fails**.

#### Step 2 (A2): multi-page PDF — page count matches

- **Input:** `data` = `(b64 fixtures/multi-page.pdf)`, `mime_type: "application/pdf"`.
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS:** valid envelope — `results` non-empty; `results[0].counts.pages` **equals 2** (the fixture's page count); `results[0].content` non-empty; `errors` absent (⇒ `[]`) or empty.
- **FAIL signature:** `counts.pages` ≠ 2, empty `content`, or non-empty `errors`.
- Text-layer PDF — extraction needs no VLM; **not LLM-dependent**.

#### Step 3 (A3): LIVE opencode attachment URI (needs user)

- **LIVE — requires user action.** Do **not** auto-skip. Ask the user: *attach `fixtures/test-image.png` to a chat message.* opencode stores it as a temp file and injects an `opencode://attachment/<uuid>.png` URI; take that URI from the conversation.
- **Input:** `data` = the attachment URI exactly as injected (e.g. `opencode://attachment/<uuid>.png`) — opencode's URI bridge resolves it to base64 client-side before the MCP call.
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS:** valid envelope — `results` non-empty; `results[0].content` non-empty; `errors` absent (⇒ `[]`) or empty.
- **FAIL signature:** 422-style error "cannot extract attachment data from URI" (attachment not resolvable — temp file cleaned up or URI not the real injected one), or empty content.
- **LLM-dependent:** PNG OCR uses the default **CPU Tesseract** engine (no VLM needed for clean pages) — this case can **PASS even when the Setup LLM probe fails**.

#### Step 4 (A4): text-layer PDF — extraction without OCR

- **Input:** `data` = `(b64 fixtures/multi-page.pdf)`, `mime_type: "application/pdf"` (same fixture as A2; different assertion focus).
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS:** valid envelope — `results` non-empty; `results[0].content` non-empty (text-layer extraction, no OCR/VLM involved); `errors` absent (⇒ `[]`) or empty.
- **FAIL signature:** empty `content` or non-empty `errors`.
- **Not LLM-dependent.**

#### Step 5 (B1): OCR — PNG via data URL (shape-based)

- **LLM-dependent (OCR):** the default OCR engine is **CPU Tesseract** (no VLM needed for clean pages) — this case can **PASS even when the Setup LLM probe fails**.
- **Input:** `data` = `data:image/png;base64,` + `(b64 fixtures/test-image.png)` — full data URL form.
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS (shape-based):** valid envelope — `results` non-empty; `results[0].content` non-empty (OCR produced text); `errors` absent (⇒ `[]`) or empty. Never assert exact text.
- **FAIL signature:** empty `content`, or non-empty `errors` mentioning OCR/LLM failure (when the probe succeeded).

#### Step 6 (B2): OCR — forced page OCR via `force_ocr_pages` (shape-based)

- **LLM-dependent (OCR):** the default OCR engine is **CPU Tesseract** (no VLM needed for clean pages) — this case can **PASS even when the Setup LLM probe fails**.
- **Input:** `data` = `(b64 fixtures/multi-page.pdf)`, `mime_type: "application/pdf"`, `config: {"force_ocr_pages": [1]}` — force OCR on page 1 (Tesseract backend).
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS (shape-based):** valid envelope — `results` non-empty; `results[0].content` non-empty; `errors` absent (⇒ `[]`) or empty.
- **FAIL signature:** structured error (4xx) or empty `content` when the probe succeeded.

#### Step 7 (B3): OCR — PNG via toon rendering (shape-based)

- **LLM-dependent (OCR):** the default OCR engine is **CPU Tesseract** (no VLM needed for clean pages) — this case can **PASS even when the Setup LLM probe fails**.
- **Input:** `data` = `(b64 fixtures/test-image.png)`, `mime_type: "image/png"`, `response_format: "toon"`.
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS (shape-based):** the tool returns **non-empty toon-rendered text** (not the JSON envelope) with no tool-level error — OCR content present in rendering form. Never assert exact text.
- **FAIL signature:** empty text, or a tool-level error when the probe succeeded.

#### Step 8 (B4): OCR — PNG via plain rendering (shape-based)

- **LLM-dependent (OCR):** the default OCR engine is **CPU Tesseract** (no VLM needed for clean pages) — this case can **PASS even when the Setup LLM probe fails**.
- **Input:** `data` = `(b64 fixtures/test-image.png)`, `mime_type: "image/png"`, `response_format: "plain"`.
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS (shape-based):** the tool returns **non-empty plain text** (content rendering, not the JSON envelope) with no tool-level error. Never assert exact text.
- **FAIL signature:** empty text, or a tool-level error when the probe succeeded.

#### Step 9 (C1): unsupported file type (no VLM needed — always run)

- **NOT LLM-dependent** — always run, even if the Setup LLM probe failed.
- **Input:** `data` = a small file's raw base64 (any bytes), `mime_type: "application/x-unsupported-format"` (an extension/MIME xberg cannot handle).
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS:** structured tool error — `isError: true` with a 422-style message indicating the format/type is unsupported (or, if xberg returns an envelope, `errors` non-empty). No successful extraction result.
- **FAIL signature:** `isError: false` (unsupported input was "extracted" anyway).

#### Step 10 (C2): invalid / empty base64 (no VLM needed — always run)

- **NOT LLM-dependent** — always run, even if the Setup LLM probe failed.
- **Inputs (both sub-calls):**
  1. `data: ""` — empty string.
  2. `data: "!!!not-valid-base64!!!"` — undecodable garbage.
- **Invoke:** bound `extract_bytes` via `meta_use` for each.
- **PASS:** both calls return a structured tool error — `isError: true` with a clear error message (missing-data message, or 4xx rejection of undecodable/empty bytes). No bogus envelope with content.
- **FAIL signature:** `isError: false` on either call, or an empty/crashing response instead of a structured error.

#### Step 11 (C3): malformed config (no VLM needed — always run)

- **NOT LLM-dependent** — always run, even if the Setup LLM probe failed.
- **Input:** `data` = `(b64 fixtures/multi-page.pdf)`, `mime_type: "application/pdf"`, `config: {"pages": {"insert_page_markers": true, "marker_format": null}}` — structurally invalid config section (a required string field passed as `null`; or equivalently any config with a missing required field / wrong type).
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS:** structured tool error — `isError: true` with a 400-style config-validation message (or, if xberg returns an envelope, `errors` non-empty). Not a silent success.
- **FAIL signature:** `isError: false` (malformed config accepted and ignored).

#### Step 12 (C4): oversized / invalid dimensions (no VLM needed — always run; OPTIONAL, heavy)

- **NOT LLM-dependent** — always run, even if the Setup LLM probe failed.
- **OPTIONAL (skip-by-default):** the primary path sends a huge payload; run only when explicitly requested.
- **Input (primary):** `data` = a base64 string **> 48,900,000 characters** (e.g. repeat a valid chunk until over the limit) — trips the wrapper's documented size guard (`MAX_BASE64_LENGTH = 48,900,000`).
- **Input (lightweight alternative):** corrupted image dimensions — take `fixtures/test-image.png` bytes, flip the width/height bytes in the PNG IHDR chunk, base64-encode, `mime_type: "image/png"`.
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS:** structured tool error — `isError: true` with the size-guard message ("exceeds size limit") or a 4xx rejection (corrupted dimensions), or the 413 body-limit mapping. No successful extraction.
- **FAIL signature:** `isError: false`, or a connection/transport-level crash instead of a structured error.

#### Step 13 (D1): page markers ON (`config.pages.insert_page_markers: true`)

- **Input:** `data` = `(b64 fixtures/multi-page.pdf)`, `mime_type: "application/pdf"`, `config: {"pages": {"insert_page_markers": true}}`.
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS:** valid envelope; `results[0].content` contains page markers for both pages — `<!-- PAGE 1 -->` **and** `<!-- PAGE 2 -->` (marker template `<!-- PAGE {page_num} -->`); `errors` absent (⇒ `[]`) or empty.
- **FAIL signature:** markers missing from a multi-page PDF with the flag set to true.
- Text-layer PDF — **not LLM-dependent**.

#### Step 14 (D2): page markers OFF (`config.pages.insert_page_markers: false`)

- **Input:** `data` = `(b64 fixtures/multi-page.pdf)`, `mime_type: "application/pdf"`, `config: {"pages": {"insert_page_markers": false}}`.
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS:** valid envelope; `results[0].content` non-empty and contains **no** `<!-- PAGE` markers; `errors` absent (⇒ `[]`) or empty.
- **FAIL signature:** page markers present despite the flag being explicitly false.
- **Not LLM-dependent.**

#### Step 15 (D3): page markers — default (flag omitted)

- **Input:** `data` = `(b64 fixtures/multi-page.pdf)`, `mime_type: "application/pdf"` — **no** `config` argument.
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS:** valid envelope; content matches the documented default — `insert_page_markers` defaults to **false**, so `results[0].content` contains **no** `<!-- PAGE` markers; `errors` absent (⇒ `[]`) or empty.
- **FAIL signature:** markers appear without explicit config (default contradicts documentation).
- **Not LLM-dependent.**

#### Step 16 (D4): typo guard — singular `config.page` → 400 "unknown field page"

- **Known gotcha (SKILL.md):** the config key is **plural** — `pages`. The singular `page` is rejected by xberg.
- **Input:** `data` = `(b64 fixtures/multi-page.pdf)`, `mime_type: "application/pdf"`, `config: {"page": {"insert_page_markers": true}}` — singular `page` (the typo).
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS:** structured tool error — `isError: true` with the 400 message containing **"unknown field page"** (xberg rejects the unknown singular key). Not a silent success.
- **FAIL signature:** `isError: false` (singular `page` silently accepted or silently ignored).
- **Not LLM-dependent.**

#### Step 17 (D5): `disable_ocr` — skip VLM OCR on image-only pages (timeout recovery)

- **Not LLM-dependent** — the flag's whole point is avoiding OCR (CPU Tesseract default) and any VLM call; runs even if the Setup LLM probe failed.
- **Input:** `data` = `(b64 fixtures/multi-page.pdf)`, `mime_type: "application/pdf"`, `disable_ocr: true` — first-class param (no raw xberg `config` JSON needed; the wrapper merges it into `config.disable_ocr`).
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS:** valid envelope — `results` non-empty; `results[0].content` non-empty (native text layer only, no VLM/LLM call); `errors` absent (⇒ `[]`) or empty. On scanned/image-only documents the call returns fast instead of timing out.
- **FAIL signature:** tool-level error, empty `content`, or a timeout (the default OCR path was still taken).
- Text-layer PDF — no OCR needed; the flag must not break the normal path.

#### Step 18 (D6): `disable_ocr` on PNG — empty content (no text layer)

- **Not LLM-dependent** — the flag skips OCR (CPU Tesseract default) and any VLM call; runs even if the Setup LLM probe failed.
- **Input:** `data` = `(b64 fixtures/test-image.png)`, `mime_type: "image/png"`, `disable_ocr: true`.
- **Invoke:** bound `extract_bytes` via `meta_use`.
- **PASS:** valid envelope — `results` non-empty; `results[0].content` **empty or very short** (images have no native text layer; no OCR was performed); `errors` absent (⇒ `[]`) or empty. **Fast response** (no LLM call).
- **FAIL signature:** tool-level error, or a timeout (the flag was ignored and OCR — CPU Tesseract default — was still attempted).
- **Contrast test:** compare with B1 (same PNG, no `disable_ocr`) — B1 uses the default OCR (CPU Tesseract) and returns OCR text; D6 skips OCR and returns empty (fast).

#### Step 19 (D7): OCR vs `disable_ocr` comparison — same PDF, both modes

- **LLM-dependent for OCR path** — D7a uses default OCR (CPU Tesseract); D7b uses `disable_ocr` (no OCR).
- **D7a — OCR enabled (default):**
  - **Input:** `data` = `(b64 fixtures/multi-page.pdf)`, `mime_type: "application/pdf"` — no `disable_ocr` param.
  - **Invoke:** bound `extract_bytes` via `meta_use`.
  - **PASS:** valid envelope — `results` non-empty; `results[0].content` non-empty; `errors` absent (⇒ `[]`) or empty.
  - **FAIL signature:** empty `content` or non-empty `errors`.
  - Default OCR uses **CPU Tesseract** — can **PASS even when the Setup LLM probe fails**.

- **D7b — OCR disabled:**
  - **Input:** `data` = `(b64 fixtures/multi-page.pdf)`, `mime_type: "application/pdf"`, `disable_ocr: true`.
  - **Invoke:** bound `extract_bytes` via `meta_use`.
  - **PASS:** valid envelope — `results` non-empty; `results[0].content` non-empty (native text layer, no OCR); `errors` absent (⇒ `[]`) or empty. **Fast response**.
  - **FAIL signature:** tool-level error, empty `content`, or timeout.

- **Comparison assertion:** Both D7a and D7b should succeed on a text-layer PDF. D7b is faster (no OCR). On scanned/image-only PDFs, D7a would use OCR (default CPU Tesseract, VLM fallback on low quality) while D7b returns only the native text layer (fast, possibly empty).

### Cleanup

- Verification step — confirm the environment is still healthy after the run:
  - A cheap bound-tool probe still resolves at the MCP layer (succeeds, or returns a structured tool error rather than a connection failure).
- Fixtures are read-only repo assets — **no teardown needed** (the A3 attachment temp file is removed automatically by opencode after the session).
- No wire probes in this step; liveness is confirmed through the remote bound-tool probe only.

### Expected Outcomes Summary

| Case | PASS signature | LLM-dependent? |
|------|----------------|----------------|
| **A1** — PNG raw base64 | Envelope OK; `results` non-empty; `results[0].content` non-empty; no `errors` | No (CPU Tesseract OCR) |
| **A2** — multi-page PDF | Envelope OK; `results[0].counts.pages` = 2; content non-empty | No (text layer) |
| **A3** — LIVE attachment URI | Envelope OK; content non-empty (user attaches image in chat; opencode injects the URI) | No (LIVE + CPU Tesseract OCR) |
| **A4** — text-layer PDF | Envelope OK; content non-empty (no OCR) | No (text layer) |
| **B1** — PNG data URL OCR | Envelope OK; content non-empty (shape-based) | No (CPU Tesseract OCR) |
| **B2** — `force_ocr_pages` OCR | Envelope OK; content non-empty (shape-based) | No (CPU Tesseract OCR) |
| **B3** — PNG toon OCR | Non-empty toon rendering, no tool error (shape-based) | No (CPU Tesseract OCR) |
| **B4** — PNG plain OCR | Non-empty plain rendering, no tool error (shape-based) | No (CPU Tesseract OCR) |
| **C1** — unsupported file type | `isError: true`, 422-style unsupported-format error | No — **always run** |
| **C2** — invalid/empty base64 | `isError: true`, structured missing/invalid-data error | No — **always run** |
| **C3** — malformed config | `isError: true`, 400-style config-validation error | No — **always run** |
| **C4** — oversized/invalid dimensions | `isError: true`, size-guard / 4xx / 413 error (OPTIONAL, heavy) | No — **always run** |
| **D1** — markers true | Content contains `<!-- PAGE 1 -->` and `<!-- PAGE 2 -->` | No |
| **D2** — markers false | Content contains no `<!-- PAGE` markers | No |
| **D3** — markers default (omitted) | Documented default: no `<!-- PAGE` markers (default false) | No |
| **D4** — singular `page` typo guard | `isError: true`, 400 "unknown field page" | No |
| **D5** — `disable_ocr: true` (PDF) | Envelope OK; content non-empty (native text layer, no VLM); fast on image-only docs | No |
| **D6** — `disable_ocr: true` (PNG) | Envelope OK; content empty/short (no text layer in images, no OCR); **fast** (no LLM) | No |
| **D7** — OCR vs disable_ocr comparison | D7a (OCR): content non-empty (CPU Tesseract default); D7b (disable_ocr): content non-empty, fast; both succeed on text-layer PDFs | No (D7a CPU Tesseract, D7b disable_ocr) |
