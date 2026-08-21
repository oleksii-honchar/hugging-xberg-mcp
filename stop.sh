#!/bin/bash
# Stop the local smoke-test compose
# Usage: ./stop.sh
set -euo pipefail

docker compose down
echo "Stopped."
