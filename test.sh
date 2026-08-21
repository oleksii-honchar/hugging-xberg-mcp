#!/bin/bash
# Smoke test hugging-xberg-mcp against the local compose environment
# Uses Python-based MCP testing via stdio subprocess (from better-opencode mcp-test)
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

# ── Checks 2-5: MCP server tests via Python ─────────────────────────────────
echo ""
echo "=== Check: MCP server smoke test ==="
cyan_info "Launching MCP stdio subprocess (docker compose exec hugging-xberg-mcp node src/mcp-server.mjs) ..."

# Use the better-opencode mcp-test.sh that handles stdio properly
if [ -f "$HOME/.config/opencode/opencode.json" ]; then
  MCP_TEST="$HOME/.config/opencode/opencode.json"
else
  MCP_TEST="none"
fi

# Run a quick Python-based smoke test directly
# The fixture path is resolved relative to the script's directory.
FIXTURE_PATH="$SCRIPT_DIR/fixtures/test-image.png"

python3 - "$FIXTURE_PATH" << 'PYEOF'
import json
import subprocess
import sys
import time

def log(msg):
    """Print verbose info to stdout."""
    print(f"[INFO] {msg}")

def test_mcp_server(fixture_path):
    """Test the hugging-xberg-mcp server via stdio."""
    cmd = [
        "docker", "compose", "exec", "-T",
        "hugging-xberg-mcp",
        "node", "src/mcp-server.mjs"
    ]
    
    log(f"Executing: {cmd}")
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    # Wait for startup
    time.sleep(0.5)
    if proc.poll() is not None:
        err = proc.stderr.read()
        log(f"Server exited early. stderr={err}")
        print("FAIL: server-exit")
        return False
    
    passed = []
    failed = []
    
    # Check 1: Initialize handshake
    log("")
    log("--- Test: initialize-handshake ---")
    try:
        init_msg = json.dumps({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "smoke-test", "version": "1.0"}
            }
        })
        log(f"Sent: initialize (id=1)")
        proc.stdin.write(init_msg + "\n")
        proc.stdin.flush()
        
        line = proc.stdout.readline()
        response = json.loads(line)
        log(f"Received: {json.dumps(response, indent=2)}")
        
        if "result" in response:
            server_info = response["result"]
            log(f"Server name={server_info.get('name')}, version={server_info.get('version')}")
            passed.append("initialize-handshake")
        else:
            failed.append("initialize-handshake")
    except Exception as e:
        failed.append(f"initialize-handshake: {str(e)}")
    
    # Send initialized notification
    try:
        notif = json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"})
        log("Sent: notifications/initialized")
        proc.stdin.write(notif + "\n")
        proc.stdin.flush()
    except:
        pass
    
    # Check 2: tools/list
    log("")
    log("--- Test: tools-list ---")
    try:
        tools_msg = json.dumps({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        })
        log(f"Sent: tools/list (id=2)")
        proc.stdin.write(tools_msg + "\n")
        proc.stdin.flush()
        
        line = proc.stdout.readline()
        response = json.loads(line)
        log(f"Received: {json.dumps(response, indent=2)}")
        
        if "result" in response:
            tools_data = response["result"]
            tool_count = len(tools_data.get("tools", []))
            for t in tools_data.get("tools", []):
                log(f"  Tool: name={t['name']}, title={t.get('title','')}, desc={t.get('description','')[:80]}")
            passed.append(f"tools-list ({tool_count} tools)")
        else:
            failed.append("tools-list")
    except Exception as e:
        failed.append(f"tools-list: {str(e)}")
    
    # Check 3: extract_bytes tool call
    log("")
    log(f"--- Test: extract_bytes (with fixture PNG) ---")
    log(f"Fixture path being used: {fixture_path}")
    try:
        import base64, os
        log(f"File exists at that path: {os.path.isfile(fixture_path)}")
        # Read the fixture image file
        if fixture_path and os.path.isfile(fixture_path):
            with open(fixture_path, "rb") as f:
                test_bytes = f.read()
            log(f"Read fixture: {fixture_path} ({len(test_bytes)} bytes)")
            test_data_b64 = base64.b64encode(test_bytes).decode('ascii')
        else:
            # Fallback: generate a tiny PNG in memory
            import struct, zlib
            def create_minimal_png():
                """Create a minimal valid PNG."""
                width = 2; height = 2
                raw_data = b''
                for y in range(height):
                    raw_data += b'\x00' + bytes([0, 0, 0] * width)
                compressed = zlib.compress(raw_data)
                png = bytearray(b'\x89PNG\r\n\x1a\n')
                ihdr_struct = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
                ihdr_crc = zlib.crc32(b'IHDR' + ihdr_struct) & 0xffffffff
                png += bytearray(struct.pack('>I', len(ihdr_struct))) + bytearray(ihdr_struct) + struct.pack('>I', ihdr_crc)
                crc_of_compressed = zlib.crc32(compressed) & 0xffffffff
                png += struct.pack('>I', len(compressed)) + bytearray(compressed) + struct.pack('>I', crc_of_compressed)
                iend_crc = zlib.crc32(b'IEND') & 0xffffffff
                png += struct.pack('>I', 0) + struct.pack('>I', iend_crc)
                return bytes(png)
            test_bytes = create_minimal_png()
            log("Generated minimal PNG in memory")
            test_data_b64 = base64.b64encode(test_bytes).decode('ascii')
        
        call_msg = json.dumps({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "extract_bytes",
                "arguments": {
                    "data": test_data_b64,
                    "mime_type": "image/png"
                }
            }
        })
        log(f"Sent: tools/call extract_bytes (id=3)")
        proc.stdin.write(call_msg + "\n")
        proc.stdin.flush()
        
        line = proc.stdout.readline()
        response = json.loads(line)
        log(f"Received: {json.dumps(response, indent=2)}")
        
        if "result" in response:
            content = response["result"].get("content", [])
            is_error = response["result"].get("isError", False)
            has_content = any(c.get("type") == "text" for c in content)
            if has_content and not is_error:
                text_parts = [c.get('text','')[:100] for c in content if c.get('type')=='text']
                log(f"Extracted content preview: {text_parts}")
                passed.append("extract_bytes")
            else:
                failed.append("extract_bytes")
        else:
            failed.append("extract_bytes")
    except Exception as e:
        failed.append(f"extract_bytes: {str(e)}")
    
    # Check 4: extract_structured tool call
    log("")
    log(f"--- Test: extract_structured (with fixture PNG) ---")
    try:
        call_msg = json.dumps({
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "extract_structured",
                "arguments": {
                    "data": test_data_b64,
                    "mime_type": "image/png"
                }
            }
        })
        log(f"Sent: tools/call extract_structured (id=4)")
        proc.stdin.write(call_msg + "\n")
        proc.stdin.flush()
        
        line = proc.stdout.readline()
        response = json.loads(line)
        log(f"Received: {json.dumps(response, indent=2)}")
        
        if "result" in response:
            content = response["result"].get("content", [])
            is_error = response["result"].get("isError", False)
            has_content = any(c.get("type") == "text" for c in content)
            if has_content and not is_error:
                text_parts = [c.get('text','')[:100] for c in content if c.get('type')=='text']
                log(f"Structured content preview: {text_parts}")
                passed.append("extract_structured")
            else:
                failed.append("extract_structured")
        else:
            failed.append("extract_structured")
    except Exception as e:
        failed.append(f"extract_structured: {str(e)}")
    
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except:
        proc.kill()
    
    # Output results for bash to parse
    for p in passed:
        print(f"PASS: {p}")
    for f in failed:
        print(f"FAIL: {f}")
    
    return len(failed) == 0

fixture_path = sys.argv[1]
test_mcp_server(fixture_path)
PYEOF

# Capture the exit code from python script
if [ $? -eq 0 ]; then
  cyan_info "All MCP tests passed — server is healthy and responsive"
else
  cyan_info "Some MCP tests failed (see INFO output above)"
fi

echo ""
echo "=== Summary ==="
cyan_info "Tests passed: $PASSED / Tests failed: $FAILED"
if [ $FAILED -gt 0 ]; then
  echo "   Review the INFO lines above for details on failures."
fi

exit ${FAILED}
