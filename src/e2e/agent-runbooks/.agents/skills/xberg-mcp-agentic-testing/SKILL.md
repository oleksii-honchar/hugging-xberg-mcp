---
name: xberg-mcp-agentic-testing
description: |
  Execute hugging-xberg-mcp Agentic Testing runbooks end-to-end using MCP tools in the chat session.
  Use when user asks to run xberg agent runbooks, points to src/e2e/agent-runbooks, or mentions "agent runbook" or "agentic test".
  Also trigger on: "run xberg agent runbooks", "test xberg MCP", "test xberg MCP cases", "interactive e2e test of the xberg MCP".
  DO NOT trigger on "run npm tests" or "run tests" — that is the `npm test` unit suite.
  DO NOT trigger on "run smoke scripts", "run test.sh", or "run test-remote.sh" — those are the automated shell-script baseline.
version: '1.0'
updatedAt: '2026-08-21T15:50:00+03:00'
author: 'hugging-xberg-mcp'
status: 'production-ready'
tags: ['agentic-testing', 'agent-runbooks', 'mcp', 'xberg', 'interactive']
---

# Xberg MCP Agentic Testing

## Role

Execute the hugging-xberg-mcp Agentic Testing runbooks end-to-end in the chat session, **against the remote (LiteLLM) xberg endpoint**. This skill knows the xberg MCP tool chain (remote via puma.lan) and the runbook conventions, so an agent can run them autonomously without manual setup.

> **Remote-only:** the agent runbooks target the **remote** xberg deployment (LiteLLM on puma.lan). The local dev stack (`./start.sh`) and its `hugging-xberg-dev` opencode entry exist for dev / CI baseline scripting (`test.sh`), but are **not** a runbook testing target — runbooks bind to the remote variant only.

**Critical distinction — three kinds of tests in hugging-xberg-mcp:**

| What user says | What to do | This skill? |
|---|---|---|
| "run npm tests", "run tests" | Run `npm test` (Jest unit suite) | **NO** — this is an npm command |
| "run smoke scripts", "run test.sh", "run test-remote.sh" | Run those shell scripts (automated baseline incl. wire probes: 405 guards, statelessness, SSE framing, remote 401, `/health`) | **NO** — these are scripted baselines |
| "run xberg agent runbooks", "test xberg MCP", "test xberg MCP cases" | Load this skill and execute runbooks via MCP tools | **YES** — interactive agent-driven testing |

- **Unit tests** — automated, run via `npm test`. Regular Jest tests.
- **Smoke scripts** — `test.sh` (local: HTTP JSON-RPC to `http://localhost:3000/mcp` + wire probes) and `test-remote.sh` (remote via LiteLLM, incl. the 401 check). Fast scripted baseline. Raw HTTP inside these scripts is **scripts-only / out of scope for runbooks** — it never appears in a runbook step.
- **Agent runbook tests** — interactive, executed by the agent in the chat using MCP tools (`meta_search` / `meta_use`). Every runbook step goes through MCP tools.

**Position:** Standalone execution skill — invoked when user triggers xberg agent runbook testing (not npm tests, not smoke scripts).

**Your Outputs:**

- Runbook execution trace in the chat (step-by-step results, MCP tool calls, verification assertions)
- Final summary: active environment, LLM status, aggregate PASS/FAIL/BLOCKED

---

## Entry Point

**Read First:**

1. The relevant runbook(s) under `src/e2e/agent-runbooks/` (e.g. `transport.test.runbook.md`, `extract-bytes.test.runbook.md`, `extract-structured.test.runbook.md`) — read the requested runbook, or all if not specified
2. Detect the active environment — run `meta_search("xberg")` and bind to the registered tool variant (see Tool Resolution below)
3. Stack / env status — `docker compose ps` from repo root (local), and check `.env` for `LITELLM_API_KEY` / LLM config vars where relevant

**Repo path conventions:**

- **Repo root:** `/Users/oleksii.honchar/www/misc/hugging-xberg-mcp`
- **Runbooks:** `src/e2e/agent-runbooks/*.test.runbook.md`
- **Fixtures** (read-only repo assets, resolved from repo root):
  - `fixtures/test-image.png` — PNG screenshot (1806×844)
  - `fixtures/multi-page.pdf` — 2-page text-layer PDF
- New fixtures (if any) use `RB_XBERG_*` unique tokens.

**Critical path rule:** Always resolve `fixtures/` from the repo root. If you're in `src/e2e/agent-runbooks/`, `cd` to repo root first.

---

## Remote MCP Setup (runbook target)

The runbooks run against the **remote xberg deployment** served through LiteLLM on puma.lan.

**Required opencode entry** (`~/.config/opencode/opencode.jsonc`):

```jsonc
"hugging-xberg": {
  "type": "remote",
  "url": "https://lite-llm.lan/mcp/hugging_xberg",
  "enabled": true,
  "category": "documents"
}
```

**Auth:** the remote entry authenticates with Bearer `LITELLM_API_KEY` (an `sk-*` LiteLLM virtual key, from env / `.env` — never hardcoded).

**Verification:** after (re)starting the opencode session, run `meta_search("xberg")`. **opencode prefixes every MCP tool with the entry name**, so the remote xberg tools are:

- `hugging-xberg_hugging_kreuzberg-extract_bytes`
- `hugging-xberg_hugging_kreuzberg-extract_structured`

i.e. opencode entry prefix `hugging-xberg_` + the LiteLLM **upstream server** name (`hugging_kreuzberg` as of 2026-08-21). If neither appears, the remote `hugging-xberg` entry is not bound — see "Dead-connection recovery" in the Workflow.

---

## Tool Resolution (remote)

Runbooks target the **remote** xberg variant; the agent binds it at Setup.

| Aspect | Remote (LiteLLM) |
|--------|------------------|
| Stack | puma.lan compose (xberg served through LiteLLM) |
| Endpoint | `https://lite-llm.lan/mcp/hugging_xberg` |
| opencode entry | `hugging-xberg` |
| `extract_bytes` | `meta_use("hugging-xberg_hugging_kreuzberg-extract_bytes", …)` |
| `extract_structured` | `meta_use("hugging-xberg_hugging_kreuzberg-extract_structured", …)` |
| Auth | Bearer `LITELLM_API_KEY` (env/`.env`, never hardcoded) |
| **Detection signal** | `hugging-xberg_hugging_kreuzberg-*` xberg-extract names present |
| **Logs to check** | puma.lan LiteLLM / xberg logs |

Remote xberg tool names = opencode entry prefix `hugging-xberg_` + the LiteLLM **upstream server** name. As of 2026-08-21 the remote upstream is the legacy `hugging_kreuzberg` server, so remote tools are `hugging-xberg_hugging_kreuzberg-*`. Confirm the exact remote name with `meta_search("xberg")` at Setup (it changes if the LiteLLM upstream is renamed).

**All steps go through MCP tools (`meta_search` / `meta_use`) — no raw HTTP in any runbook.** Bash is only for: base64 payload computation (`b64()` helper) and reading logs.

---

## Workflow

### Phase 1: Setup — Bind Remote Tool, LLM Probe

**Objective:** Bind the remote xberg tool variant, verify LLM reachability.

1. **Bind remote tool:** run `meta_search("xberg")` — confirm the remote variant is registered:
   - `hugging-xberg_hugging_kreuzberg-extract_bytes` / `hugging-xberg_hugging_kreuzberg-extract_structured` (as of 2026-08-21; confirm the exact name at Setup) → **remote** (the runbook target).

   Use the bound tool name in every step.

2. **Dead-connection recovery:** if `meta_search` finds NO bound remote xberg tools → confirm the `hugging-xberg` opencode entry is `enabled: true` and points at `https://lite-llm.lan/mcp/hugging_xberg`, then **restart the opencode session** — opencode never retries dead MCP connections. Re-probe with `meta_search` after the restart.

3. **LLM probe (ADR-014):** run ONE cheap LLM probe — a minimal `extract_structured` call on `fixtures/test-image.png`. On success, all cases run. On failure, follow "LLM Setup Prerequisite" below.

**Output:** Confirmation of bound remote tool and LLM status.

### Phase 2: Discover Runbooks

**Objective:** List available runbooks and determine which to execute.

1. List `src/e2e/agent-runbooks/*.test.runbook.md`
2. If user specified a particular runbook, read only that one
3. If user did not specify, read ALL runbooks and present them:
   ```
   Available runbooks:
    1. transport.test.runbook.md          — MCP discovery + remote tool binding (F1–F2)
   2. extract-bytes.test.runbook.md      — extract_bytes cases (A1–A4, B1–B4, C1–C4, D1–D4)
   3. extract-structured.test.runbook.md — extract_structured cases (E1–E4)

   All runbooks will be executed.
   ```

**Output:** List of runbooks to execute (single or all).

### Phase 3: Execute Runbook Steps

**Objective:** Execute each runbook step-by-step using MCP tools.

For each runbook, execute its steps in order:

1. **Read the runbook** — parse the test steps, prerequisites, and expected outcomes
2. **Execute prerequisites** — check that preconditions are met (e.g. LLM reachable for LLM-dependent cases)
3. **Execute test steps sequentially** — for each step:
   - All functional steps are MCP tool calls via the **bound tool** — never raw HTTP
   - Compute base64 payloads in bash with the portable helper: `b64() { base64 < "$1" | tr -d '\n'; }`
   - If the step involves assertions, verify and report pass/fail
4. **Report results** — after each runbook, summarize:
   ```
   === [runbook-name] Result ===
   Total checks: X
   Passed: X
   Failed: X
   Blocked (LLM config): X
   ```

**Output:** Step-by-step execution trace with pass/fail/blocked for each assertion.

### Phase 4: Cleanup

**Objective:** Verify the environment is left healthy.

Fixtures are read-only repo assets — **no teardown needed**. Run a verification step:

1. Confirm the remote stack is still healthy (a cheap bound-tool probe resolves at the MCP layer — succeeds or returns a structured tool error, not a connection failure)
2. Confirm fixtures are unchanged

**Output:** Confirmation that the environment is healthy after the run.

### Phase 5: Final Summary

**Objective:** Consolidate results from all executed runbooks.

1. Report the **active environment** (remote — bound tool variant + `https://lite-llm.lan/mcp/hugging_xberg` endpoint)
2. Report the **LLM status** (Setup probe result)
3. Aggregate PASS/FAIL/BLOCKED counts across all runbooks
4. Report any failures with details

**Output:** Final test summary in the chat.

---

## LLM Setup Prerequisite (ADR-014)

The LLM/VLM endpoint is a **config concern, not an environment gate**. At Setup run ONE cheap LLM probe (a minimal structured/OCR call).

- **On success** — all cases run normally.
- **On failure** — report the LLM as unconfigured/unreachable with the EXACT vars to fix:
  - `XBERG_LLM_BASE_URL` — structured-extraction LLM endpoint (e.g. `http://lite-llm:4000/v1` on puma-net)
  - `xberg.toml` → `ocr.vlm_config.base_url` — VLM OCR endpoint
  - `LITELLM_API_KEY` — Bearer key (env / repo `.env`; never hardcoded)
  - Model (e.g. `puma-qwopus3.5-9b-instruct`)

  Then mark VLM/structured-dependent cases as **blocked (LLM config)** — while text-layer, page-marker, envelope, and error-path cases (no VLM needed) still run.

This distinguishes "environment not configured" from "product bug" without baking a permanent gate into runbook semantics.

---

## Runbook Conventions

Conventions that apply to every runbook. Treat these as hard rules, not suggestions.

- **MCP-only:** all runbook observations go through MCP tools via `meta_search` / `meta_use` — never raw HTTP in a runbook step. Wire-level probes (405 guards, statelessness, SSE framing, remote 401, xberg `/health`) live in the scripts (`test.sh` / `test-remote.sh`) only.
- **Bound tools:** steps reference tools by logical name (`extract_bytes`, `extract_structured`); use the variant bound at Setup.
- **Fixtures:** reuse `fixtures/test-image.png` and `fixtures/multi-page.pdf` (read-only repo assets, resolved from repo root).
- **Portable base64 helper** (macOS BSD + GNU Linux): `b64() { base64 < "$1" | tr -d '\n'; }`
- **Envelope assertions:** parse the tool's text result as JSON; the `errors` key is **omitted when empty** — treat missing as `[]`.
- **OCR content assertions:** shape-based (envelope + non-empty), never exact text — VLM output is non-deterministic.
- **Secrets:** `$LITELLM_API_KEY` from env / repo `.env`; never in runbook text.
- **Cleanup:** no fixture teardown; each runbook carries a verification step (stack still healthy after the run).

---

## Cross-Links (no duplication)

Related knowledge lives in the repo vault — reference by name, never copy:

- `.vault/concepts/` — `0004-mcp-tool-reference`, `0001-mcp-streamable-http-stateless`, `0003-pdf-support-pagination`, `0002-opencode-attachment-uri-bridge`
- `.vault/memories/` — `0002-litellm-reinit-per-operation`, `0003-litellm-tool-name-prefixing`, `0004-opencode-no-retry-mcp-connection`, `0006-base64-corruption-422-errors`
- `.vault/runbooks/0003-test-mcp-server` — operational (human/script level), not the agent runbooks

---

## Gotchas

| Anti-Pattern | Correction |
|---|---|
| Using bare `extract_bytes` / assuming "unprefixed" tools | **opencode always prefixes MCP tools with the entry name** — remote xberg tools are `hugging-xberg_hugging_kreuzberg-*` (entry prefix `hugging-xberg_` + LiteLLM upstream server `hugging_kreuzberg`), never bare (`.vault/memories/0003-litellm-tool-name-prefixing`). Bind via `meta_search` at Setup and match the entry-name prefix; never hardcode a bare name. |
| Assuming server-side session state across calls | LiteLLM reinitializes the MCP session per operation (create transport → initialize → call → close); the server is stateless (`.vault/memories/0002-litellm-reinit-per-operation`). Never rely on state from a previous call. |
| Sending corrupted or line-wrapped base64 | Corrupted base64 produces parse errors (422-style) (`.vault/memories/0006-base64-corruption-422-errors`). Use the portable helper: `b64() { base64 < "$1" | tr -d '\n'; }`. |
| Expecting opencode to reconnect after the stack dies | opencode never retries dead MCP connections (`.vault/memories/0004-opencode-no-retry-mcp-connection`). Confirm the remote `hugging-xberg` entry is correct, then **restart the opencode session**. |
| Using `config.page` for page markers | The xberg config key is **plural**: `config.pages.insert_page_markers`. The singular `page` → xberg 400 `unknown field page`. |
| Requiring the `errors` key to be present in the envelope | The `errors` key is **omitted when empty** — treat a missing `errors` as `[]`, not as a failure. |
| Using GNU-only `base64 -w0` on macOS | macOS BSD base64 has no `-w0`. Use `b64() { base64 < "$1" | tr -d '\n'; }` — the stdin form works on both BSD and GNU. |

---

## When to Ask for Direction

Stop and ask when you encounter:

- **MCP tools not found** — `meta_search("xberg")` still finds no bound remote xberg tools after confirming the `hugging-xberg` entry + opencode session restart
- **LLM unreachable** — the Setup LLM probe fails and the user cannot supply working `XBERG_LLM_BASE_URL` / `LITELLM_API_KEY` / model config on the remote stack
- **Opencode attachment not provided** — the A3 live-attachment step (in `extract-bytes.test.runbook.md`) requires the human to attach `fixtures/test-image.png` to a chat message; ask if it hasn't been provided
- **Remote endpoint/auth ambiguous** — no remote xberg tool variant appears, and the user is unsure whether the `hugging-xberg` opencode entry or `LITELLM_API_KEY` is correct

---

## Quality Checklist

- [ ] Confirmed this is an agent-runbook request (not "run npm tests" / "run smoke scripts")
- [ ] Bound REMOTE tool variant verified via `meta_search("xberg")` (`hugging-xberg_hugging_kreuzberg-*`)
- [ ] Remote environment + endpoint recorded
- [ ] LLM probe run at Setup; status recorded
- [ ] Every runbook step executed via MCP tools (no raw HTTP in runbooks)
- [ ] Envelope assertions treat missing `errors` as `[]`; OCR assertions are shape-based
- [ ] LLM-dependent cases marked **blocked (LLM config)** only when the Setup probe failed
- [ ] Cleanup / verification step executed (remote stack still healthy)
- [ ] Final summary reports: remote environment, LLM status, aggregate PASS/FAIL/BLOCKED
