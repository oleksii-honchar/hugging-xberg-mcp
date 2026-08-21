#!/bin/bash
# Test the remote hugging-xberg MCP endpoint (HTTP transport).
# Reads config from config.json in the same directory.
# Usage: ./test-remote.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASSED=0
FAILED=0

# ── SSE unwrapper ───────────────────────────────────────────────────────────
# LiteLLM returns SSE-wrapped responses: "event: message\ndata: {json}"
# Strip the wrapper and return just the JSON.
unwrap_sse() {
  local raw
  raw=$(cat)
  # Try to extract data: line from SSE format
  local json_line
  json_line=$(echo "$raw" | grep '^data: ' | head -1 | sed 's/^data: //')
  if [ -n "$json_line" ]; then
    echo "$json_line"
  else
    # Already plain JSON — return as-is
    echo "$raw"
  fi
}

# ── Portable base64 ─────────────────────────────────────────────────────────
# Stdin form `base64 < file` works on both macOS BSD and GNU Linux;
# `tr -d '\n'` removes line wrapping (replaces the GNU-only -w0 flag).
b64() { base64 < "$1" | tr -d '\n'; }

pass() { echo -e "  ${GREEN}PASS${NC}: $1"; ((PASSED++)); }
fail() { echo -e "  ${RED}FAIL${NC}: $1"; ((FAILED++)); }
cyan_info() { echo -e "  ${CYAN}---$1${NC}"; }

# ── Load env ────────────────────────────────────────────────────────────────
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env not found at $ENV_FILE"
  exit 1
fi
set -a; source "$ENV_FILE"; set +a

MCP_URL="https://lite-llm.lan/mcp/hugging_xberg"
AUTH_TOKEN="${LITELLM_API_KEY:?LITELLM_API_KEY not set in .env}"

if [ -z "$AUTH_TOKEN" ]; then
  echo "ERROR: LITELLM_API_KEY must be set in .env"
  exit 1
fi

echo ""
echo "=== Remote MCP test: $MCP_URL ==="

# ── Check: remote Bearer auth (401) ────────────────────────────────────────
# A request with a WRONG Bearer token must be rejected (401/403, or
# LiteLLM's wrapped auth error) and must NOT return any tools.
# The correct-key path is covered by the existing checks below.
echo ""
echo "=== Check: remote Bearer auth (401) ==="
cyan_info "Requesting tools/list with WRONG Bearer — must be rejected (no tools leaked)..."

WRONG_KEY_RESP=$(curl -s -w '\n%{http_code}' -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer wrong-key-123" \
  -d '{"jsonrpc":"2.0","id":0,"method":"tools/list","params":{}}' --max-time 30)
WRONG_CODE=$(echo "$WRONG_KEY_RESP" | tail -1)
WRONG_BODY=$(echo "$WRONG_KEY_RESP" | sed '$d')

WRONG_TOOLS=$(echo "$WRONG_BODY" | jq '(.result.tools // []) | length' 2>/dev/null || echo 0)
AUTH_ENFORCED=false
if [ "$WRONG_CODE" = "401" ] || [ "$WRONG_CODE" = "403" ]; then
  AUTH_ENFORCED=true
elif [ "$WRONG_CODE" = "500" ] && echo "$WRONG_BODY" | grep -qiE 'auth|virtual key|invalid.*token|not found in db'; then
  # LiteLLM wraps auth rejection as HTTP 500 + error object (not 401/403)
  AUTH_ENFORCED=true
fi
if [ "$AUTH_ENFORCED" = "true" ] && [ "$WRONG_TOOLS" -eq 0 ]; then
  pass "remote Bearer auth (wrong key rejected with HTTP $WRONG_CODE, no tools leaked)"
else
  fail "remote Bearer auth (wrong key NOT rejected: HTTP $WRONG_CODE, tools=$WRONG_TOOLS)"
fi

# ── Check 1: tools/list ────────────────────────────────────────────────────
echo ""
echo "=== Check: tools/list ==="
cyan_info "Requesting tools..."

RESPONSE=$(curl -sf -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}')

if [ $? -eq 0 ] && echo "$RESPONSE" | unwrap_sse | jq -e '.result.tools' > /dev/null 2>&1; then
  TOOL_COUNT=$(echo "$RESPONSE" | unwrap_sse | jq '.result.tools | length')
  echo "$RESPONSE" | unwrap_sse | jq -r '.result.tools[] | "  Tool: \(.name)"'
  pass "tools/list ($TOOL_COUNT tools)"
else
  fail "tools/list (response: $RESPONSE)"
fi

# ── Check 2: extract_bytes with a minimal PNG ─────────────────────────────
echo ""
echo "=== Check: extract_bytes ==="
cyan_info "Generating minimal PNG and calling extract_bytes..."

# Create a tiny base64-encoded PNG inline (portable: temp file + b64 helper)
MINIMAL_PNG_TMP=$(mktemp)
printf '\x89PNG\r\n\x1a\n' > "$MINIMAL_PNG_TMP"
MINIMAL_PNG=$(b64 "$MINIMAL_PNG_TMP")
rm -f "$MINIMAL_PNG_TMP"

# Use a real fixture if available
FIXTURE="$SCRIPT_DIR/fixtures/test-image.png"
if [ -f "$FIXTURE" ]; then
  TEST_DATA=$(b64 "$FIXTURE")
  MIME_TYPE="image/png"
  cyan_info "Using fixture: $FIXTURE ($(wc -c < "$FIXTURE") bytes)"
else
  # Minimal valid PNG (2x2 black pixels)
  TEST_DATA="iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z3+AAAAIklEQVQIW2nk5+f/DWD///////8fAAAPCgEBGfJq1wAAAABJRU5ErkJggg=="
  MIME_TYPE="image/png"
  cyan_info "Using generated minimal PNG"
fi

RESPONSE=$(curl -sf -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"hugging_xberg-extract_bytes\",\"arguments\":{\"data\":\"$TEST_DATA\",\"mime_type\":\"$MIME_TYPE\"}}}")

if [ $? -eq 0 ] && echo "$RESPONSE" | unwrap_sse | jq -e '.result.content' > /dev/null 2>&1; then
  HAS_TEXT=$(echo "$RESPONSE" | unwrap_sse | jq '[.result.content[] | select(.type == "text")] | length')
  IS_ERROR=$(echo "$RESPONSE" | unwrap_sse | jq '.result | .isError // false')
  if [ "$HAS_TEXT" -gt 0 ] && [ "$IS_ERROR" = "false" ]; then
    PREVIEW=$(echo "$RESPONSE" | unwrap_sse | jq -r '.result.content[] | select(.type == "text") | .text[0:200]' | head -1)
    cyan_info "Extracted preview: $PREVIEW"
    pass "extract_bytes"
  else
    fail "extract_bytes (no text content or error response)"
  fi
else
  fail "extract_bytes (curl failed or no result: $RESPONSE)"
fi

# ── Check 3: extract_bytes with data URL (simulates agent backend file attachment) ─────
echo ""
echo "=== Check: extract_bytes (data URL) ==="
cyan_info "Calling extract_bytes with full data URL (simulating opencode file attachment)..."

DATA_URL="data:${MIME_TYPE};base64,${TEST_DATA}"

RESPONSE=$(curl -sf -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\",\"params\":{\"name\":\"hugging_xberg-extract_bytes\",\"arguments\":{\"data\":\"$DATA_URL\",\"mime_type\":\"$MIME_TYPE\"}}}")

if [ $? -eq 0 ] && echo "$RESPONSE" | unwrap_sse | jq -e '.result.content' > /dev/null 2>&1; then
  HAS_TEXT=$(echo "$RESPONSE" | unwrap_sse | jq '[.result.content[] | select(.type == "text")] | length')
  IS_ERROR=$(echo "$RESPONSE" | unwrap_sse | jq '.result | .isError // false')
  if [ "$HAS_TEXT" -gt 0 ] && [ "$IS_ERROR" = "false" ]; then
    PREVIEW=$(echo "$RESPONSE" | unwrap_sse | jq -r '.result.content[] | select(.type == "text") | .text[0:200]' | head -1)
    cyan_info "Extracted preview: $PREVIEW"
    pass "extract_bytes (data URL)"
  else
    fail "extract_bytes (data URL) (no text content or error response)"
  fi
else
  fail "extract_bytes (data URL) (curl failed or no result: $RESPONSE)"
fi

# ── Check 4: extract_structured with data URL (simulates agent backend file attachment) ─────
echo ""
echo "=== Check: extract_structured (data URL) ==="
cyan_info "Calling extract_structured with full data URL (simulating opencode file attachment)..."

DATA_URL_STRUCTURED="data:${MIME_TYPE};base64,${TEST_DATA}"

RESPONSE=$(curl -sf -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"hugging_xberg-extract_structured\",\"arguments\":{\"data\":\"$DATA_URL_STRUCTURED\"}}}")

if [ $? -eq 0 ] && echo "$RESPONSE" | unwrap_sse | jq -e '.result' > /dev/null 2>&1; then
  HAS_TEXT=$(echo "$RESPONSE" | unwrap_sse | jq '[.result.content[] | select(.type == "text")] | length')
  IS_ERROR=$(echo "$RESPONSE" | unwrap_sse | jq '.result | .isError // false')
  if [ "$HAS_TEXT" -gt 0 ] && [ "$IS_ERROR" = "false" ]; then
    PREVIEW=$(echo "$RESPONSE" | unwrap_sse | jq -r '.result.content[] | select(.type == "text") | .text[0:200]' | head -1)
    cyan_info "Structured preview: $PREVIEW"
    pass "extract_structured (data URL)"
  else
    fail "extract_structured (data URL) (no text content or error response)"
  fi
else
  fail "extract_structured (data URL) (curl failed or no result: $RESPONSE)"
fi

# ── Check 5: extract_structured with a minimal schema ─────────────────────
echo ""
echo "=== Check: extract_structured ==="
cyan_info "Calling extract_structured with minimal schema..."

# Escape the schema for embedding in JSON
SCHEMA='{
  "type": "object",
  "properties": {
    "summary": {"type": "string"}
  }
}'

RESPONSE=$(curl -sf -s -X POST "$MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"tools/call\",\"params\":{\"name\":\"hugging_xberg-extract_structured\",\"arguments\":{\"data\":\"$TEST_DATA\",\"mime_type\":\"$MIME_TYPE\",\"schema\":$(echo \"$SCHEMA\" | jq -c .)}}}")

if [ $? -eq 0 ] && echo "$RESPONSE" | unwrap_sse | jq -e '.result' > /dev/null 2>&1; then
  HAS_TEXT=$(echo "$RESPONSE" | unwrap_sse | jq '[.result.content[] | select(.type == "text")] | length')
  IS_ERROR=$(echo "$RESPONSE" | unwrap_sse | jq '.result | .isError // false')
  if [ "$HAS_TEXT" -gt 0 ] && [ "$IS_ERROR" = "false" ]; then
    PREVIEW=$(echo "$RESPONSE" | unwrap_sse | jq -r '.result.content[] | select(.type == "text") | .text[0:200]' | head -1)
    cyan_info "Structured preview: $PREVIEW"
    pass "extract_structured"
  else
    fail "extract_structured (no text content or error response)"
  fi
else
  fail "extract_structured (curl failed or no result: $RESPONSE)"
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "=== Summary ==="
cyan_info "Tests passed: $PASSED / Tests failed: $FAILED"
if [ $FAILED -gt 0 ]; then
  echo "   Review the output above for details on failures."
fi

exit ${FAILED}
