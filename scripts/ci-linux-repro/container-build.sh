#!/usr/bin/env bash
# Runs INSIDE the opal-repro container (see Dockerfile). Reproduces the Linux
# release build from .github/workflows/release.yml against the mounted repo.
#
# Mounts expected (provided by run.sh):
#   /src            read-only checkout of the repo
#   /work           volume: working copy (rsynced from /src)
#   /cache          volume: cargo registry + build target
#   /opt/vcpkg      volume: vcpkg tree with the static x64-linux deps
#
# Usage (first arg): full | link   (default: link)
#   full  also runs `pnpm tauri build --bundles deb,appimage`
#   link  stops after `cargo build --release` (the historically-failing step)
set -euo pipefail

MODE="${1:-link}"
TRIPLET=x64-linux

export VCPKG_ROOT=/opt/vcpkg
# Rust binaries come from the image; the cargo registry + warm target stay in
# the /cache volume so repeat runs only relink.
export CARGO_HOME=/cache/cargo
export RUSTUP_HOME=/opt/rustup
export CARGO_TARGET_DIR=/cache/target
export PATH="/opt/cargo/bin:$VCPKG_ROOT:$PATH"
VLIB="$VCPKG_ROOT/installed/$TRIPLET/lib"

log() { echo -e "\n\033[1;36m== $* ==\033[0m"; }

# ---------------------------------------------------------------- vcpkg -------
if [ ! -x "$VCPKG_ROOT/vcpkg" ]; then
  log "bootstrap vcpkg"
  git clone https://github.com/microsoft/vcpkg "$VCPKG_ROOT"
  "$VCPKG_ROOT/bootstrap-vcpkg.sh" -disableMetrics
fi
log "vcpkg install static Tectonic deps ($TRIPLET)"
"$VCPKG_ROOT/vcpkg" install 'harfbuzz[graphite2]' freetype icu fontconfig \
  --triplet "$TRIPLET"

# ---------------------------------------------------------------- sync src ---
log "rsync repo /src -> /work"
mkdir -p /work
rsync -a --delete \
  --exclude '.git/' --exclude 'node_modules/' --exclude 'target/' \
  --exclude 'dist/' --exclude 'build/' \
  /src/ /work/

# ------------------------------------------------------ dep env (matches CI) -
# Resolve Tectonic's native deps through pkg-config against the vcpkg tree.
# The vcpkg lib dir ships only static .a archives, so ICU/HarfBuzz/Graphite2/
# FreeType/Fontconfig link statically while GTK/WebKit stay dynamic from the
# system pkgconfig paths. Deliberately NO PKG_CONFIG_ALL_STATIC (that forces
# GTK/WebKit static and pulls in an unavailable -lsystemd). Keep in sync with
# the "Install static Tectonic dependencies" step in release.yml.
export TECTONIC_DEP_BACKEND=pkg-config
export PKG_CONFIG_PATH="$VLIB/pkgconfig"
export CXXFLAGS="-std=c++17"

cd /work
log "pnpm install"
pnpm install --frozen-lockfile

if [ "$MODE" = "full" ]; then
  # tauri build runs the desktop package's beforeBuildCommand (pnpm build) to
  # produce apps/desktop/dist, then compiles and bundles.
  log "pnpm tauri build --bundles deb,appimage"
  pnpm --filter=@opal/desktop tauri build --bundles deb,appimage
else
  # Link check: build the frontend (tsc + vite -> apps/desktop/dist) so
  # tauri_build has the frontendDist, then compile the release binary.
  log "pnpm build (frontend dist for @opal/desktop)"
  pnpm --filter=@opal/desktop build
  log "cargo build --release (link check)"
  cd /work/apps/desktop/src-tauri
  cargo build --release
fi

# ------------------------------------------------------------- audit ---------
bin=/cache/target/release/tectonic-editor-desktop
if [ -f "$bin" ]; then
  log "dependency-closure audit (mirrors scripts/audit-linux-bundle.sh)"
  forbidden='lib(icu[^ ]*|harfbuzz|graphite2|freetype|fontconfig|png[^ ]*|ssl|crypto)\.so'
  if readelf -d "$bin" | grep -E "$forbidden"; then
    echo "FAIL: forbidden dynamic dependency present"; exit 1
  fi
  echo "PASS: no forbidden dynamic deps (ICU/HarfBuzz/Graphite2/FreeType/Fontconfig static)"
fi
log "done"
