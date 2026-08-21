#!/bin/bash
# Build the hugging-xberg-mcp Docker image
# Usage: ./build.sh [tag]
#
# Tags the built image with:
#   - the requested tag (default: latest)
#   - the version read from package.json (e.g. 2.0.0)
#
# The requested positional-argument tag is honored and tagged as well.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE_BASE="tuiteraz/hugging-xberg-mcp"

# Read version from package.json (consistent with build-and-push.sh)
PACKAGE_VERSION=""
if [ -f "$SCRIPT_DIR/package.json" ]; then
  PACKAGE_VERSION="$(jq -r '.version' "$SCRIPT_DIR/package.json" 2>/dev/null || echo "")"
fi

# Requested tag (default: latest)
TAG="${1:-latest}"

# Collect unique tags: the requested tag plus the version from package.json
TAGS=("${TAG}")
if [ -n "${PACKAGE_VERSION}" ]; then
  if [ "${PACKAGE_VERSION}" != "${TAG}" ]; then
    TAGS+=("${PACKAGE_VERSION}")
  fi
fi

# Build tag arguments
BUILD_TAGS=()
for t in "${TAGS[@]}"; do
  BUILD_TAGS+=("--tag" "${IMAGE_BASE}:${t}")
done

docker build "${BUILD_TAGS[@]}" .

echo "Built:"
for t in "${TAGS[@]}"; do
  echo "  ${IMAGE_BASE}:${t}"
done
