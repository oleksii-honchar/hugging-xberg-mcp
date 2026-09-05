#!/bin/bash
# Smoke test hugging-xberg-mcp against the local compose environment.
#
# The MCP server is HTTP-only (streamable HTTP transport on :3000/mcp), so all
# functional checks use HTTP JSON-RPC via curl. Wire probes (405 guards,
# statelessness, SSE framing) are owned here per ADR-013 — runbooks never do
# raw HTTP.
#
# Usage: ./test.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASSED=0
FAILED=0

pass() { echo -e "  ${GREEN}PASS${NC}: $1"; ((PASSED++)); }
fail() { echo -e "  ${RED}FAIL${NC}: $1"; ((FAILED++)); }
info() { echo -e "  ${YELLOW}INFO${NC}: $1"; }
cyan_info() { echo -e "  ${CYAN}---$1${NC}"; }

# ── Helpers ─────────────────────────────────────────────────────────────────
# Portable base64 encoder (macOS BSD + GNU): reads a file, strips newlines.
b64() { base64 < "$1" | tr -d '\n'; }

# SSE unwrapper — the MCP server (and LiteLLM) may wrap responses in SSE:
#   "event: message\ndata: {json}\n"
# Strip the wrapper and return just the JSON.
# NOTE: uses printf '%s\n' (not echo) so backslash escapes inside the JSON are
# preserved regardless of invoking shell (bash + zsh).
unwrap_sse() {
  local raw
  raw=$(cat)
  local json_line
  json_line=$(printf '%s\n' "$raw" | grep '^data: ' | head -1 | sed 's/^data: //')
  if [ -n "$json_line" ]; then
    printf '%s\n' "$json_line"
  else
    printf '%s\n' "$raw"
  fi
}

# MCP endpoint + fixture
MCP_URL="http://localhost:3000/mcp"
FIXTURE_PATH="$SCRIPT_DIR/fixtures/test-image.png"

# ── Pre-check: compose must be running ──────────────────────────────────────
echo ""
echo "=== Check: docker compose services ==="
if ! docker compose ps --format json 2>/dev/null | grep -q "running"; then
  fail "docker compose is not running. Run ./start.sh first."
  exit 1
fi
pass "docker compose services are running"

# ── Check 1: Xberg API reachable ────────────────────────────────────────────
echo ""
echo "=== Check: Xberg API ==="
cyan_info "Requesting http://localhost:8000/health ..."
HEALTH_RESPONSE=$(curl -sf -s http://localhost:8000/health 2>&1)
if [ $? -eq 0 ]; then
  cyan_info "Response body: $HEALTH_RESPONSE"
  pass "Xberg API health check"
else
  fail "Xberg API health check (curl exit code $?; response=$HEALTH_RESPONSE)"
  exit 1
fi

# ── Check 2: initialize handshake ───────────────────────────────────────────
echo ""
echo "=== Check: MCP initialize ==="
cyan_info "POST initialize to $MCP_URL ..."
RESPONSE=$(curl -sf -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1.0"}}}')
if [ $? -eq 0 ] && printf '%s\n' "$RESPONSE" | unwrap_sse | jq -e '.result.serverInfo' > /dev/null 2>&1; then
  SERVER_NAME=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq -r '.result.serverInfo.name // "unknown"')
  SERVER_VERSION=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq -r '.result.serverInfo.version // "?"')
  pass "MCP initialize (serverInfo=$SERVER_NAME/$SERVER_VERSION)"
else
  fail "MCP initialize (response: $RESPONSE)"
fi

# ── Check 3: tools/list (assert exactly 2 tools) ────────────────────────────
echo ""
echo "=== Check: tools/list ==="
cyan_info "POST tools/list to $MCP_URL ..."
RESPONSE=$(curl -sf -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}')
if [ $? -eq 0 ] && printf '%s\n' "$RESPONSE" | unwrap_sse | jq -e '.result.tools' > /dev/null 2>&1; then
  TOOL_COUNT=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq '.result.tools | length')
  TOOL_NAMES=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq -r '.result.tools[].name' | tr '\n' ' ')
  if [ "$TOOL_COUNT" -eq 2 ] && printf '%s\n' "$RESPONSE" | unwrap_sse \
      | jq -e '.result.tools | map(.name) | sort == ["extract_bytes","extract_structured"]' > /dev/null 2>&1; then
    pass "tools/list (2 tools: $TOOL_NAMES)"
  else
    fail "tools/list (expected exactly [extract_bytes, extract_structured], got count=$TOOL_COUNT names='$TOOL_NAMES')"
  fi
else
  fail "tools/list (curl failed or no result.tools: $RESPONSE)"
fi

# ── Check 4: extract_bytes tool call (fixture PNG) ──────────────────────────
echo ""
echo "=== Check: extract_bytes ==="
cyan_info "Calling extract_bytes with fixture PNG ($(wc -c < "$FIXTURE_PATH") bytes) ..."
TEST_DATA=$(b64 "$FIXTURE_PATH")
RESPONSE=$(curl -sf -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"extract_bytes\",\"arguments\":{\"data\":\"$TEST_DATA\",\"mime_type\":\"image/png\"}}}")
if [ $? -eq 0 ] && printf '%s\n' "$RESPONSE" | unwrap_sse | jq -e '.result.content' > /dev/null 2>&1; then
  HAS_TEXT=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq '[.result.content[] | select(.type == "text")] | length')
  IS_ERROR=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq '.result | .isError // false')
  if [ "$HAS_TEXT" -gt 0 ] && [ "$IS_ERROR" = "false" ]; then
    PREVIEW=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq -r '.result.content[] | select(.type == "text") | .text[0:200]' | head -1)
    cyan_info "Extracted preview: $PREVIEW"
    pass "extract_bytes"
  else
    fail "extract_bytes (no text content or isError=true)"
  fi
else
  fail "extract_bytes (curl failed or no result.content: $RESPONSE)"
fi

# ── Check 4b: ocr_engine knob (spec §7.4) ───────────────────────────────────
echo ""
echo "=== Check: ocr_engine knob ==="

# 4b-1: ocr_engine=tesseract
cyan_info "Calling extract_bytes with ocr_engine=tesseract ..."
RESPONSE=$(curl -sf -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"extract_bytes\",\"arguments\":{\"data\":\"$TEST_DATA\",\"mime_type\":\"image/png\",\"ocr_engine\":\"tesseract\"}}}")
if [ $? -eq 0 ] && printf '%s\n' "$RESPONSE" | unwrap_sse | jq -e '.result.content' > /dev/null 2>&1; then
  HAS_TEXT=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq '[.result.content[] | select(.type == "text")] | length')
  IS_ERROR=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq '.result | .isError // false')
  if [ "$HAS_TEXT" -gt 0 ] && [ "$IS_ERROR" = "false" ]; then
    pass "extract_bytes ocr_engine=tesseract"
  else
    fail "extract_bytes ocr_engine=tesseract (no text content or isError=true)"
  fi
else
  fail "extract_bytes ocr_engine=tesseract (curl failed or no result.content: $RESPONSE)"
fi

# 4b-2: ocr_engine=vlm
cyan_info "Calling extract_bytes with ocr_engine=vlm ..."
RESPONSE=$(curl -sf -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"extract_bytes\",\"arguments\":{\"data\":\"$TEST_DATA\",\"mime_type\":\"image/png\",\"ocr_engine\":\"vlm\"}}}")
if [ $? -eq 0 ] && printf '%s\n' "$RESPONSE" | unwrap_sse | jq -e '.result.content' > /dev/null 2>&1; then
  HAS_TEXT=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq '[.result.content[] | select(.type == "text")] | length')
  IS_ERROR=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq '.result | .isError // false')
  if [ "$HAS_TEXT" -gt 0 ] && [ "$IS_ERROR" = "false" ]; then
    pass "extract_bytes ocr_engine=vlm"
  else
    fail "extract_bytes ocr_engine=vlm (no text content or isError=true)"
  fi
else
  fail "extract_bytes ocr_engine=vlm (curl failed or no result.content: $RESPONSE)"
fi

# 4b-3: disable_ocr + ocr_engine=vlm (no OCR)
cyan_info "Calling extract_bytes with disable_ocr + ocr_engine=vlm ..."
RESPONSE=$(curl -sf -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"tools/call\",\"params\":{\"name\":\"extract_bytes\",\"arguments\":{\"data\":\"$TEST_DATA\",\"mime_type\":\"image/png\",\"disable_ocr\":true,\"ocr_engine\":\"vlm\"}}}")
if [ $? -eq 0 ] && printf '%s\n' "$RESPONSE" | unwrap_sse | jq -e '.result.content' > /dev/null 2>&1; then
  HAS_TEXT=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq '[.result.content[] | select(.type == "text")] | length')
  IS_ERROR=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq '.result | .isError // false')
  if [ "$HAS_TEXT" -gt 0 ] && [ "$IS_ERROR" = "false" ]; then
    pass "extract_bytes disable_ocr + ocr_engine=vlm (no OCR)"
  else
    fail "extract_bytes disable_ocr+ocr_engine=vlm (no text content or isError=true)"
  fi
else
  fail "extract_bytes disable_ocr+ocr_engine=vlm (curl failed or no result.content: $RESPONSE)"
fi

# ── Check 5: extract_structured tool call (fixture PNG) ─────────────────────
echo ""
echo "=== Check: extract_structured ==="
cyan_info "Calling extract_structured with fixture PNG ..."
RESPONSE=$(curl -sf -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"extract_structured\",\"arguments\":{\"data\":\"$TEST_DATA\",\"mime_type\":\"image/png\"}}}")
if [ $? -eq 0 ] && printf '%s\n' "$RESPONSE" | unwrap_sse | jq -e '.result.content' > /dev/null 2>&1; then
  HAS_TEXT=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq '[.result.content[] | select(.type == "text")] | length')
  IS_ERROR=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq '.result | .isError // false')
  if [ "$HAS_TEXT" -gt 0 ] && [ "$IS_ERROR" = "false" ]; then
    PREVIEW=$(printf '%s\n' "$RESPONSE" | unwrap_sse | jq -r '.result.content[] | select(.type == "text") | .text[0:200]' | head -1)
    cyan_info "Structured preview: $PREVIEW"
    pass "extract_structured"
  else
    fail "extract_structured (no text content or isError=true)"
  fi
else
  fail "extract_structured (curl failed or no result.content: $RESPONSE)"
fi

# ── Wire probes (scripts-only ownership per ADR-013) ────────────────────────
echo ""
echo "=== Check: wire probes ==="

# GET guard — server rejects non-POST with 405
GET_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$MCP_URL")
if [ "$GET_CODE" = "405" ]; then
  pass "GET /mcp → 405 (method not allowed)"
else
  fail "GET /mcp (expected 405, got $GET_CODE)"
fi

# DELETE guard — server rejects session-delete with 405
DELETE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 -X DELETE "$MCP_URL")
if [ "$DELETE_CODE" = "405" ]; then
  pass "DELETE /mcp → 405 (method not allowed)"
else
  fail "DELETE /mcp (expected 405, got $DELETE_CODE)"
fi

# Statelessness — two independent tools/list calls (separate connections, no
# shared session state) must BOTH return 200 + a valid result.
SL_OK=true
SL_ERR=""
for i in 1 2; do
  SL_RESP=$(curl -sf -s -m 10 -X POST "$MCP_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":10,"method":"tools/list","params":{}}')
  if [ $? -ne 0 ] || ! printf '%s\n' "$SL_RESP" | unwrap_sse | jq -e '.result.tools' > /dev/null 2>&1; then
    SL_OK=false
    SL_ERR="call #$i did not return a valid tools result"
    break
  fi
done
if [ "$SL_OK" = true ]; then
  pass "statelessness (2 independent tools/list, both 200 + valid result)"
else
  fail "statelessness ($SL_ERR)"
fi

# SSE framing check — a POST with the SSE Accept header must return SSE framing:
#   "event: message" line + "data: {json}" line
SSE_RAW=$(curl -s -m 10 -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":11,"method":"tools/list","params":{}}')
if printf '%s\n' "$SSE_RAW" | grep -q '^event: message' && printf '%s\n' "$SSE_RAW" | grep -q '^data: '; then
  pass "SSE framing (event: message + data: {json})"
else
  fail "SSE framing (expected 'event: message' + 'data:' lines, got: $(printf '%s\n' "$SSE_RAW" | head -2))"
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "=== Summary ==="
cyan_info "Tests passed: $PASSED / Tests failed: $FAILED"
if [ $FAILED -gt 0 ]; then
  echo "   Review the output above for details on failures."
fi

exit ${FAILED}
