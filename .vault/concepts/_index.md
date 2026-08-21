---
type: index
title: "Domain Concepts"
createdAt: "2026-08-09T10:59:55Z"
updatedAt: "2026-08-21T10:59:18Z"
tags: []
---

# Domain Concepts

Key concepts and domain vocabulary for the hugging-xberg MCP server (port of the previous hugging-kreuzberg-mcp wrapper).

## Nodes

### Transport & Protocol

- [[0001-mcp-streamable-http-stateless.concept]] — MCP Streamable HTTP Stateless Transport — stateless pattern + LiteLLM protocol spec (requests, session lifecycle, error handling, upstream checklist)
- [[0002-opencode-attachment-uri-bridge.concept]] — opencode Attachment URI Bridge — URI indirection for file attachments in MCP tools (incl. vision-flag check)
- [[0003-pdf-support-pagination.concept]] — PDF Support & Output-Side Pagination — `config.pages.insert_page_markers` (plural!), chunking, force_ocr_pages
- [[0004-mcp-tool-reference.concept]] — MCP Tool Reference — `extract_bytes` / `extract_structured` inputs, `response_format` enum, response envelope
