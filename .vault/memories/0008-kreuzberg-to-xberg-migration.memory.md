---
type: memory
title: "Migrating from hugging_kreuzberg-* to hugging_xberg-*"
createdAt: "2026-08-21T10:59:18Z"
updatedAt: "2026-08-21T10:59:18Z"
tags: [xberg, migration, gotcha, tool-names]
see_also: ["adrs/0005-port-hugging-kreuzberg-to-xberg.adr.md", "runbooks/0005-troubleshoot-connectivity.runbook.md", "memories/0003-litellm-tool-name-prefixing.memory.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Memory: Migrating from hugging_kreuzberg-* to hugging_xberg-*

## Fact

Migrating from the old hugging-kreuzberg-mcp to hugging-xberg-mcp requires four changes in prompts, workflows, and configs:

1. **Tool name changes** — references to `hugging_kreuzberg-extract_bytes` (old LiteLLM-prefixed name) must become `hugging_xberg-extract_bytes` (and `hugging_xberg-extract_structured`).
2. **Input format** — `extract_bytes` expects base64/data URL, not file paths.
3. **Structured extraction** — the schema is server-side: update `structured-schema.json` and restart the container instead of passing a schema per-call (ADR-0004).
4. **Response shape** — tool output is the Xberg envelope `{results, errors, summary}` (`errors` key **omitted when empty**).

## Context

The port was driven by the upstream Kreuzberg → xberg-io/xberg rebrand (ADR-0005). The client-visible tool prefix change (`hugging_kreuzberg-` → `hugging_xberg-`) was coordinated during the puma.lan cutover; stale references in agent prompts/skills break tool resolution.

## Impact

- Grep prompts, skills, and agent configs for `hugging_kreuzberg-` and update to `hugging_xberg-`.
- Code that parses tool responses must tolerate a **missing** `errors` key (treat as empty list).
- Per-call schema parameters must be removed; schema changes are now deploy-time, not request-time.
