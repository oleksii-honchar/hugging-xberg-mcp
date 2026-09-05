# .vault — Vault Home

Durable knowledge vault for the hugging-xberg MCP server project (port of the previous hugging-kreuzberg-mcp wrapper). Organized by knowledge type with C4 architecture maps for system-level documentation.

> **Draft note (in-repo):** Vault nodes were rebranded during the `hugging-kreuzberg-mcp` → `hugging-xberg-mcp` port. Promotion to the durable vault is **pending vault-keeper review** — do not self-promote.

## Vault Areas

- [[decisions/_index]] — Architecture Decision Records (10 ADRs)
- [[specifications/_index]] — Feature specs and migrations (2 specs)
- [[concepts/_index]] — Domain concepts and vocabulary (4 concepts)
- [[architectures/_index]] — C4 layered architecture (1 system: 1 container + 1 component node)
- [[runbooks/_index]] — Operational procedures (5 runbooks)
- [[memories/_index]] — Gotchas and operational learnings (11 memories)

## Vault Contract

Every node has ≥1 edge (wikilink or `see_also`). No orphan nodes. Naming: `<NNNN>-<slug>.<type>.<ext>`. IDs generated via `vault-next-id.sh`. Architectural claims verified against codebase; unverified claims flagged with ⚠️.
