#!/bin/bash
# Build the hugging-xberg-mcp Docker image
# Usage: ./build.sh [--tag <tag>]
set -euo pipefail

TAG="${1:-latest}"
IMAGE="tuiteraz/hugging-xberg-mcp:${TAG}"

docker build -t "$IMAGE" .
echo "Built $IMAGE"
