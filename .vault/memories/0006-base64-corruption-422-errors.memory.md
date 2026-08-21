---
type: memory
title: "Corrupted Base64 → 422 ParsingError (kreuzberg-era record)"
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-21T10:59:18Z"
tags: [base64, gotcha, error, historical]
see_also: ["architectures/hugging-xberg-mcp/containers/0001-system-container.container.md", "adrs/0005-port-hugging-kreuzberg-to-xberg.adr.md"]
deprecated:
  date: null
  reason: null
  superseded_by: null
---

# Memory: Corrupted Base64 → 422 ParsingError (kreuzberg-era record)

> **Historical note:** This memory documents the pre-port kreuzberg backend behavior (the original `hugging-kreuzberg-mcp`, see ADR-0005). The xberg backend reports extraction failures differently — check the `errors` / `processing_warnings` keys in the `{results, errors, summary}` envelope. The base64-validation checklist below still applies.

## Fact

The old kreuzberg backend returned `422 ParsingError: Failed to decode image: Format error decoding Png: CRC error` when the base64 data was corrupted or not a valid image. Common causes: base64 encoding/decoding mismatch, data URL prefix not stripped correctly, or file truncated during transfer.

## Context

Documented in runbook/0005-troubleshoot-connectivity (Issue 6, kreuzberg-era note). Verified against kreuzberg error responses.

## Impact

- Validate base64 data before sending to the extraction backend
- Verify with `echo "BASE64" | base64 -d > /tmp/test.png && file /tmp/test.png`
- Data URL prefix must be stripped: `data:image/png;base64,` → raw base64
- The client's `extractBase64()` helper handles this transparently
