#!/usr/bin/env bash
# build-and-push.sh — Build and push hugging-xberg-mcp Docker image
#
# Builds the hugging-xberg-mcp MCP server and pushes to Docker Hub
# under the tuiteraz namespace. Also pushes a versioned tag read from
# package.json (e.g. 1.0.1) alongside the requested tag.
#
# Usage:
#   ./build-and-push.sh                            # Build + push (latest + version from package.json)
#   ./build-and-push.sh --tag v1.0.0               # Tag with specific version + package.json version
#   ./build-and-push.sh --build-only               # Build only, skip push
#   ./build-and-push.sh --push-only                # Push only (assumes image is built)
#   ./build-and-push.sh --dry-run                  # Dry run (show commands, don't execute)
#   ./build-and-push.sh --no-cache                 # Skip build cache
#   ./build-and-push.sh --platform linux/arm64     # Single platform (default: all)
#
# Prerequisites:
#   - Docker Desktop with buildx (multi-arch)
#   - Logged in to Docker Hub:  docker login
#
# Image registry: docker.io/tuiteraz/hugging-xberg-mcp

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────
REGISTRY="docker.io"
NAMESPACE="tuiteraz"
REPO="hugging-xberg-mcp"
IMAGE_BASE="${REGISTRY}/${NAMESPACE}/${REPO}"

FORK_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Read version from package.json ────────────────────────────────────────────
PACKAGE_VERSION=""
if [ -f "$FORK_DIR/package.json" ]; then
  PACKAGE_VERSION=$(jq -r '.version' "$FORK_DIR/package.json" 2>/dev/null || echo "")
fi

# ── Defaults ───────────────────────────────────────────────────────────────────
BUILD_ONLY=false
PUSH_ONLY=false
DRY_RUN=false
NO_CACHE=false
TAG="latest"
PLATFORM="linux/amd64,linux/arm64"

# ── Parse flags ────────────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --build-only) BUILD_ONLY=true
      shift
      ;;
    --push-only)  PUSH_ONLY=true
      shift
      ;;
    --dry-run)    DRY_RUN=true
      shift
      ;;
    --no-cache)   NO_CACHE=true
      shift
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --build-only         Build only, skip push"
      echo "  --push-only          Push only (assumes image is built locally)"
      echo "  --dry-run            Show commands without executing"
      echo "  --no-cache           Skip build cache"
      echo "  --tag TAG            Tag to use (default: latest)"
      echo "  --platform PLATFORM  Docker platform(s), comma-separated (default: linux/amd64,linux/arm64)"
      echo ""
      echo "Examples:"
      echo "  $0                                              # Build + push (latest + version from package.json)"
      echo "  $0 --tag v1.0.0                                 # Tag with version + package.json version"
      echo "  $0 --build-only                                 # Build only"
      echo "  $0 --platform linux/arm64                       # ARM64 only"
      echo "  $0 --dry-run                                    # Dry run"
      echo ""
      echo "Note: If package.json has a version, a versioned tag is also pushed."
      echo "Note: Requires docker login to ${REGISTRY}/${NAMESPACE}"
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# ── Pre-flight checks ─────────────────────────────────────────────────────────
echo "=== hugging-xberg-mcp build-and-push ==="
echo ""

# Check Docker
docker ps >/dev/null 2>&1 || { echo "ERROR: Docker is not running"; exit 1; }

# Check buildx
if ! docker buildx version >/dev/null 2>&1; then
  echo "ERROR: docker buildx not available. Install: docker buildx create --use"
  exit 1
fi

# Check Dockerfile
if [ ! -f "$FORK_DIR/Dockerfile" ]; then
  echo "ERROR: Dockerfile not found: $FORK_DIR/Dockerfile"
  exit 1
fi

# Check current branch
CURRENT_BRANCH=$(git -C "$FORK_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
echo "Current branch:    $CURRENT_BRANCH"
echo "Image base:        ${IMAGE_BASE}"
echo "Tag:               ${TAG}"
echo "Platform:          ${PLATFORM}"
echo ""

# ── Helper functions ───────────────────────────────────────────────────────────
run_cmd() {
  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY RUN] Would execute: $*"
    return 0
  fi
  "$@"
}

# ── Build phase ────────────────────────────────────────────────────────────────
if [ "$PUSH_ONLY" = false ]; then
  image_tag="${IMAGE_BASE}:${TAG}"
  local_tag="${NAMESPACE}/${REPO}:${TAG}"

  # Collect all tags: the requested tag plus the package version
  ALL_TAGS=("${local_tag}" "${image_tag}")
  if [ -n "$PACKAGE_VERSION" ]; then
    version_local="${NAMESPACE}/${REPO}:${PACKAGE_VERSION}"
    version_image="${IMAGE_BASE}:${PACKAGE_VERSION}"
    ALL_TAGS+=("${version_local}" "${version_image}")
  fi

  echo "=== Building: ${image_tag} ==="
  echo "  Image: ${image_tag}"
  echo "  Local: ${local_tag}"
  if [ -n "$PACKAGE_VERSION" ]; then
    echo "  Version: ${IMAGE_BASE}:${PACKAGE_VERSION}"
  fi
  echo ""

  cache_opts=""
  if [ "$NO_CACHE" = true ]; then
    cache_opts="--no-cache"
  fi

  # Multi-arch requires --push (buildx pushes directly to the registry,
  # bypassing the local docker daemon). Only add it for a real build+push;
  # a build-only (--build-only) run stays a local single-arch build.
  push_flag=""
  if [ "$BUILD_ONLY" = false ]; then
    push_flag="--push"
  else
    echo "  Note: --build-only performs a local single-arch build."
    echo "        Use ./build-and-push.sh (default) for a multi-arch image (requires --push)."
  fi

  # Build tag arguments
  build_tags=()
  for t in "${ALL_TAGS[@]}"; do
    build_tags+=("--tag" "${t}")
  done

  run_cmd docker buildx build \
    --platform "${PLATFORM}" \
    "${build_tags[@]}" \
    --progress=plain \
    $cache_opts \
    $push_flag \
    "$FORK_DIR" \
    2>&1

  echo ""
  echo "  ✓ Build complete: ${image_tag}"
  if [ -n "$PACKAGE_VERSION" ]; then
    echo "  ✓ Version tag:   ${IMAGE_BASE}:${PACKAGE_VERSION}"
  fi
  echo ""
fi

# ── Push phase ─────────────────────────────────────────────────────────────────
if [ "$BUILD_ONLY" = false ]; then
  image_tag="${IMAGE_BASE}:${TAG}"

  # When a real build+push (not --build-only, not --push-only) ran above, the
  # image was already pushed directly to the registry via buildx --push. In that
  # case there is nothing local to push, so we skip docker push entirely.
  # Only run docker push here for --push-only mode (image assumed pre-built locally).
  if [ "$PUSH_ONLY" = true ]; then
    echo "=== Pushing: ${image_tag} ==="

    run_cmd docker push "${image_tag}"

    echo "  ✓ Pushed: ${image_tag}"

    # Push version tag if available
    if [ -n "$PACKAGE_VERSION" ]; then
      version_image="${IMAGE_BASE}:${PACKAGE_VERSION}"
      echo ""
      echo "=== Pushing: ${version_image} ==="

      run_cmd docker push "${version_image}"

      echo "  ✓ Pushed: ${version_image}"
    fi
  else
    echo "  (Skipped: image already pushed via buildx --push during the build phase.)"
  fi

  echo ""

  # ── Summary ────────────────────────────────────────────────────────────────
  echo "=== Summary ==="
  echo "  ${image_tag}"
  if [ -n "$PACKAGE_VERSION" ]; then
    echo "  ${IMAGE_BASE}:${PACKAGE_VERSION}"
  fi
  echo ""
  echo "Run with:"
  echo "  docker run ${image_tag}"
  if [ -n "$PACKAGE_VERSION" ]; then
    echo "  docker run ${IMAGE_BASE}:${PACKAGE_VERSION}"
  fi
  echo ""
fi

echo "Done ✓"

