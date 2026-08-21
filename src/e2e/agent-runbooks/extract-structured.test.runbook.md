> Shared conventions (prerequisites, MCP-only, bound tools, envelope assertions, cleanup): see the xberg-mcp-agentic-testing skill (SKILL.md §Runbook Conventions). This runbook is **MCP-only** — every step goes through the **bound** `extract_structured` tool via `meta_use`; no raw HTTP, no wire probes (those live in the scripts: `test.sh` / `test-remote.sh` only).

# Agent e2e test

## Extract structured scenario

### Test Objective

Verify the **bound `extract_structured` tool** end-to-end (cases E1–E4): basic structured extraction from an image, structured extraction on a multi-page PDF, a nested/complex result shape, and the input-validation error path.

> **Environment-agnostic:** steps reference the **bound tool** — the `extract_structured` variant discovered at Setup (unprefixed → local; `hugging_xberg-*` prefixed → remote). Never hardcode a variant.
>
> **Tool parameters (verified against `src/tools.js`):** `extract_structured` accepts **only `data`** (required) — there is **no schema/fields argument** in the tool signature. The extraction schema is **server-configured** (the `structured_extraction` config built by `xberg-client.js` from xberg config; default schema in `src/structured-schema.json` with `title`, `subtitle`, `metrics`). Steps therefore pass only `data` and assert on the **shape** of the server-returned structured result, never on exact values.
>
> **Envelope convention:** parse the tool's text result as JSON — `{results, errors, summary}`. The `errors` key is **omitted when empty** — treat a missing `errors` as `[]`.
>
> **Structured content assertions:** shape-based only (envelope present + structured result non-empty / nested present) — **never** exact field values, since VLM output is non-deterministic.
>
> **LLM Setup Prerequisite (ADR-014):** the Setup LLM probe (one cheap structured/OCR call) decides the LLM-dependent cases (E1–E3 — every successful structured extraction calls the VLM). Probe **succeeded** → E1–E3 run. Probe **failed** → mark E1–E3 **BLOCKED (LLM config)** and report the exact vars to fix (`XBERG_LLM_BASE_URL`, `ocr.vlm_config.base_url`, `LITELLM_API_KEY`, model). E4 is an input-validation error and is **NOT** LLM-dependent — it always runs.

### Prerequisites

- The **bound tool** is established (transport runbook F1 passed, or Setup Phase 1 completed): `meta_search("xberg")` shows exactly 2 xberg tools in ONE consistent variant; that variant is the bound `extract_structured`.
- The stack is running for the active environment (Setup Phase 1 step 3).
- Fixtures available at the repo root:
  - `fixtures/test-image.png` — PNG screenshot (1806×844, contains text and rich visual content for structured extraction).
  - `fixtures/multi-page.pdf` — 2-page **text-layer** PDF.
- Portable base64 helper (macOS BSD + GNU Linux) for payload computation in bash:
  - `b64() { base64 < "$1" | tr -d '\n'; }`
  - Resolve `fixtures/` from the repo root (`cd` there first if needed).
- Setup LLM probe status is recorded (ADR-014) — it gates E1–E3 (not E4).

### Test Steps

#### Step 1 (E1): basic structured extraction on an image (shape-based)

- **LLM-dependent (VLM):** **BLOCKED (LLM config)** if the Setup LLM probe failed.
- **Input:** `data` = `(b64 fixtures/test-image.png)` (raw base64, no prefix — the tool takes only `data`; the schema is server-configured).
- **Invoke:** bound `extract_structured` via `meta_use`.
- **PASS (shape-based):** valid envelope — the tool's text result parses as JSON; `results` non-empty; the structured result is present and **non-empty** (a structured object with at least one populated field, e.g. `title` under the default schema). `errors` absent (⇒ `[]`) or empty. Never assert exact field values.
- **FAIL signature:** envelope missing or unparseable, empty or absent structured result, or non-empty `errors` (when the probe succeeded).

#### Step 2 (E2): structured extraction on the multi-page PDF (shape-based)

- **LLM-dependent (VLM):** **BLOCKED (LLM config)** if the Setup LLM probe failed.
- **Input:** `data` = `(b64 fixtures/multi-page.pdf)` (raw base64 — no schema argument; the server-configured schema applies).
- **Invoke:** bound `extract_structured` via `meta_use`.
- **PASS (shape-based):** valid envelope — the tool's text result parses as JSON; `results` non-empty; the structured result is present, non-empty, and **shape-correct** (an object matching the server-configured schema shape). `errors` absent (⇒ `[]`) or empty. Never assert exact field values.
- **FAIL signature:** envelope missing or unparseable, empty/absent structured result, or non-empty `errors` (when the probe succeeded).

#### Step 3 (E3): structured extraction — nested/complex result (shape-based)

- **LLM-dependent (VLM):** **BLOCKED (LLM config)** if the Setup LLM probe failed.
- **Input:** `data` = `(b64 fixtures/test-image.png)` — rich content so the VLM populates nested fields; the nested structure is defined by the server-configured schema (e.g. a `metrics` array-of-objects under the default schema).
- **Invoke:** bound `extract_structured` via `meta_use`.
- **PASS (shape-based / schema conformance):** valid envelope — the tool's text result parses as JSON; `results` non-empty; the structured result matches the **server-configured schema shape** (`src/structured-schema.json`): an object with `title` (string) and `subtitle` (string), plus a **nested** `metrics` array whose items are objects carrying `name` / `value` / `delta`. Assert the **structure/keys** are present (non-empty where filled), never the exact field values or exact array length.
- **FAIL signature:** envelope missing or unparseable, structured result absent, or the expected schema shape (e.g. the `metrics` array-of-objects) missing, or non-empty `errors` (when the probe succeeded).

#### Step 4 (E4): invalid/empty data — input-validation error (NOT LLM-dependent)

- **NOT LLM-dependent — ALWAYS run**, even if the Setup LLM probe failed. This is an **input-validation error** enforced before any VLM call (empty/invalid `data` is rejected by the tool's data validation, not the LLM), so it must pass regardless of LLM config.
- **Inputs (sub-calls):**
  1. `data: ""` — empty string (missing/empty required field).
  2. `data: "!!!not-valid-base64!!!"` — undecodable garbage (alternative sub-call).
- **Invoke:** bound `extract_structured` via `meta_use` for each.
- **PASS:** structured tool error — `isError: true` with a clear missing/invalid-data message (e.g. "Missing data parameter..." or a 4xx rejection of undecodable/empty bytes), **or** (if xberg returns an envelope) `errors` non-empty. No successful structured result.
- **FAIL signature:** `isError: false` (invalid input was "extracted" anyway), or an empty/crashing response instead of a structured error.

### Cleanup

- Verification step — confirm the environment is still healthy after the run:
  - **Local:** the stack liveness check (Setup Phase 1 step 3) still passes.
  - **Remote:** a cheap bound-tool probe still resolves at the MCP layer (succeeds, or returns a structured tool error rather than a connection failure).
- Fixtures are read-only repo assets — **no teardown needed**.
- No wire probes in this step; liveness is confirmed through the detected environment only.

### Expected Outcomes Summary

| Case | PASS signature | LLM-dependent? |
|------|----------------|----------------|
| **E1** — image basic structured extraction | Envelope OK; `results` non-empty; structured result present & non-empty (shape-based) | **Yes — BLOCKED if probe failed** |
| **E2** — multi-page PDF structured extraction | Envelope OK; `results` non-empty; structured result present, non-empty, shape-correct (shape-based) | **Yes — BLOCKED if probe failed** |
| **E3** — nested/complex result | Envelope OK; `results` non-empty; nested array-of-objects present (shape-based) | **Yes — BLOCKED if probe failed** |
| **E4** — invalid/empty data (input-validation) | `isError: true`, missing/invalid-data error (or envelope with `errors` non-empty) | No — **always run (NOT LLM-dependent)** |
