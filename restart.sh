#!/bin/bash
# Restart the local smoke-test environment (xberg API + hugging-xberg-mcp)
# Usage: ./restart.sh
set -euo pipefail

./stop.sh
./start.sh

