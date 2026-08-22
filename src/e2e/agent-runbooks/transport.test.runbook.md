> Shared conventions (prerequisites, MCP-only, bound tools, envelope assertions, cleanup): see the xberg-mcp-agentic-testing skill (SKILL.md §Runbook Conventions). This runbook is **MCP-discovery + remote tool binding only** — it carries no wire probes; those live in the scripts (`test.sh` / `test-remote.sh`) only.

# Agent e2e test

## Transport scenario

### Test Objective

Verify **MCP discovery + remote tool binding** for the xberg wrapper (cases F1–F2): the MCP connection is discoverable via `meta_search`, the correct tool count and input schemas are present, the **remote** xberg tool variant is confirmed and bound, and the MCP layer completes an `initialize` handshake implicitly (a bound `tools/call` resolves at the MCP layer rather than failing at the connection).

> This runbook never probes the wire. Tool availability, schemas, and call outcomes are observed **only through MCP tools** (`meta_search` / `meta_use`).

### Prerequisites

- The **remote** xberg MCP registration is active in opencode: the `hugging-xberg` entry is `enabled: true`, pointing at `https://lite-llm.lan/mcp/hugging_xberg`, authenticated with a valid `LITELLM_API_KEY`.
- The remote stack is reachable (puma.lan).
- You are in an opencode session that has connected to MCP at startup. **If the registration was just added or changed, restart the opencode session first** — opencode does not retry dead MCP connections.

### Test Steps

#### Step 1 (F1): Remote tool discovery + binding

- Call `meta_search("xberg")`.
- Inspect the returned xberg tools.
- **opencode prefixes every MCP tool with the entry name** — xberg tools are never bare. Match on the entry-name prefix.
- **PASS:** the **two** xberg extract tools (`extract_bytes` + `extract_structured`) are discoverable under the **remote** `hugging-xberg` entry's prefix, and each exposes an **input schema**:
  - xberg-extract tools through the remote `hugging-xberg` entry → `hugging-xberg_hugging_xberg-extract_bytes` / `hugging-xberg_hugging_xberg-extract_structured` (as of 2026-08-22; confirm at Setup).
- **Record the bound remote tool names.** All subsequent steps use these **bound tools**.
- **FAIL signature:** **0** xberg extract tools discovered (dead connection → follow SKILL.md *dead-connection recovery*: confirm the `hugging-xberg` opencode entry + `LITELLM_API_KEY`, restart the opencode session, re-probe), **or** a tool missing its input schema.
- **Note:** the remote `hugging-xberg` entry routes through LiteLLM, so `meta_search` may also show non-xberg servers (e.g. paperless) under it. Select the xberg **extract** tools by their `hugging-xberg_hugging_xberg-*` prefix; extra remote-server tools are expected and not a failure.

#### Step 2 (F2): `initialize` (implicit)

- **Objective:** confirm the MCP `initialize` handshake has been established — opencode connects, initializes, and completes the handshake at session start; the runbook verifies it *implicitly* rather than by a raw handshake call.
- **Method:** through the **bound tool** from Step 1, issue a cheap probe `tools/call` (a minimal, read-safe call such as `extract_bytes` on a tiny payload) and observe the layer at which it resolves.
- **PASS:** the MCP connection is established — the tools **are** discoverable via `meta_search` (already confirmed in Step 1) **AND** the probe `tools/call` either **succeeds** or returns a **structured MCP tool error** (a well-formed tool-level result, e.g. an argument/validation or content error). A structured tool error still proves `initialize` completed, because the request reached the tool layer.
- **FAIL signature:** the probe fails at the **connection / transport / timeout** layer (no MCP result object returned at all) — i.e. discovery appeared but the connection is not actually live.
- **Record** which bound-tool variant the probe used.

### Cleanup

- Verification step — confirm the remote stack is still healthy after the run: a cheap bound-tool probe still resolves at the MCP layer (succeeds, or returns a structured tool error rather than a connection failure).
- Fixtures are read-only repo assets — **no teardown needed**.
- No wire probes in this step; liveness is confirmed through the remote bound-tool probe only.

### Expected Outcomes Summary

| Case | PASS signature | Notes |
|------|----------------|-------|
| **F1** — Remote discovery + binding | The 2 xberg extract tools present under the remote `hugging-xberg` entry prefix (`hugging-xberg_hugging_xberg-*`), each with an input schema | Records the bound remote tool names |
| **F2** — `initialize` (implicit) | Tools discoverable **and** probe `tools/call` succeeds OR returns a structured MCP tool error (not a connection/timeout failure) | Confirms the MCP handshake is established at the connection layer |
