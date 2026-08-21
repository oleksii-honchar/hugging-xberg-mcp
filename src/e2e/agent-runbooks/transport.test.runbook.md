> Shared conventions (prerequisites, MCP-only, bound tools, envelope assertions, cleanup): see the xberg-mcp-agentic-testing skill (SKILL.md §Runbook Conventions). This runbook is **MCP-discovery + environment detection only** — it carries no wire probes; those live in the scripts (`test.sh` / `test-remote.sh`) only.

# Agent e2e test

## Transport scenario

### Test Objective

Verify **MCP discovery + environment detection** for the xberg wrapper (cases F1–F2): the MCP connection is discoverable via `meta_search`, the correct tool count and input schemas are present, the active environment variant is detected and recorded, and the MCP layer completes an `initialize` handshake implicitly (a bound `tools/call` resolves at the MCP layer rather than failing at the connection).

> This runbook never probes the wire. Tool availability, schemas, and call outcomes are observed **only through MCP tools** (`meta_search` / `meta_use`).

### Prerequisites

- A local **or** remote xberg MCP registration is active in opencode (the `hugging-xberg-dev` local entry and/or the `hugging-xberg` remote entry may each be `enabled: true` — they coexist without collision; the agent binds to whichever variant is registered).
- The stack is running for the active environment:
  - **Local:** `docker compose ps` from the repo root shows both containers (`xberg` + the MCP wrapper) up and healthy.
  - **Remote:** the puma.lan stack is reachable (equivalent liveness check for the detected environment).
- You are in an opencode session that has connected to MCP at startup. **If a registration was just added or changed, restart the opencode session first** — opencode does not retry dead MCP connections.

### Test Steps

#### Step 1 (F1): Tool discovery + environment detection

- Call `meta_search("xberg")`.
- Inspect the returned xberg tools.
- **PASS:** exactly **2** xberg tools are discoverable, and each exposes an **input schema**. The names follow **one** of two variants (never a mixed set):
  - **Unprefixed:** `extract_bytes`, `extract_structured` → the **local** environment is active.
  - **LiteLLM-prefixed:** `hugging_xberg-extract_bytes`, `hugging_xberg-extract_structured` → the **remote** environment is active.
- **Record the variant as the active environment** (unprefixed → local, `hugging_xberg-*` → remote). All subsequent steps use the **bound tool** (the variant you discovered).
- **FAIL signature:** **0** xberg tools discovered (dead connection → follow SKILL.md *dead-connection recovery*: run `./start.sh`, restart the opencode session, re-probe), **or** a count ≠ 2, **or** a mixed prefix/unprefix set, **or** a tool missing its input schema.

#### Step 2 (F2): `initialize` (implicit)

- **Objective:** confirm the MCP `initialize` handshake has been established — opencode connects, initializes, and completes the handshake at session start; the runbook verifies it *implicitly* rather than by a raw handshake call.
- **Method:** through the **bound tool** from Step 1, issue a cheap probe `tools/call` (a minimal, read-safe call such as `extract_bytes` on a tiny payload) and observe the layer at which it resolves.
- **PASS:** the MCP connection is established — the tools **are** discoverable via `meta_search` (already confirmed in Step 1) **AND** the probe `tools/call` either **succeeds** or returns a **structured MCP tool error** (a well-formed tool-level result, e.g. an argument/validation or content error). A structured tool error still proves `initialize` completed, because the request reached the tool layer.
- **FAIL signature:** the probe fails at the **connection / transport / timeout** layer (no MCP result object returned at all) — i.e. discovery appeared but the connection is not actually live.
- **Record** which bound-tool variant the probe used.

### Cleanup

- Verification step — confirm the stack is still healthy after the run:
  - **Local:** `docker compose ps` still shows both containers (`xberg` + the MCP wrapper) up and healthy.
  - **Remote:** a cheap bound-tool probe still resolves at the MCP layer (succeeds, or returns a structured tool error rather than a connection failure).
- Fixtures are read-only repo assets — **no teardown needed**.
- No wire probes in this step; liveness is confirmed through the detected environment only.

### Expected Outcomes Summary

| Case | PASS signature | Notes |
|------|----------------|-------|
| **F1** — Discovery + env detection | Exactly 2 xberg tools, each with an input schema, in ONE consistent variant | Records the bound variant → active environment (unprefixed = local, `hugging_xberg-*` = remote) |
| **F2** — `initialize` (implicit) | Tools discoverable **and** probe `tools/call` succeeds OR returns a structured MCP tool error (not a connection/timeout failure) | Confirms the MCP handshake is established at the connection layer |
