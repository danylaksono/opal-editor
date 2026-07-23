#!/usr/bin/env bash
# Host launcher: reproduce the CI Linux release build locally in Docker.
#
# Builds the opal-repro image (once), provisions cache volumes, and runs the
# in-container build against the current repo checkout. First run is ~15-20 min
# (apt/rust/node baked into the image + vcpkg static deps + full compile); later
# runs relink in a few minutes because the vcpkg tree and cargo target persist
# in named volumes.
#
#   scripts/ci-linux-repro/run.sh          # link check (default, fastest)
#   scripts/ci-linux-repro/run.sh full     # also build deb + AppImage bundles
#   scripts/ci-linux-repro/run.sh --rebuild-image   # force image rebuild
#
# Requires Docker (Docker Desktop on Windows/macOS). On Windows run it from
# Git Bash. See README.md.
set -euo pipefail

MODE=link
REBUILD_IMAGE=0
for arg in "$@"; do
  case "$arg" in
    full) MODE=full ;;
    link) MODE=link ;;
    --rebuild-image) REBUILD_IMAGE=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "$here" rev-parse --show-toplevel)"
image=opal-repro:22.04

# Git Bash on Windows rewrites /-paths passed to docker; disable that.
export MSYS_NO_PATHCONV=1

if [ "$REBUILD_IMAGE" = "1" ] || ! docker image inspect "$image" >/dev/null 2>&1; then
  echo "== building image $image =="
  docker build -t "$image" "$here"
fi

for v in opal-vcpkg opal-cache opal-work; do
  docker volume inspect "$v" >/dev/null 2>&1 || docker volume create "$v" >/dev/null
done

echo "== running CI-parity Linux build (mode: $MODE) =="
exec docker run --rm \
  -v "${repo_root}:/src:ro" \
  -v opal-work:/work \
  -v opal-cache:/cache \
  -v opal-vcpkg:/opt/vcpkg \
  "$image" "$MODE"
