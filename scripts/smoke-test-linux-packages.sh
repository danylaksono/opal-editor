#!/usr/bin/env bash
set -euo pipefail

artifact_dir="${1:-artifacts}"
fixture_path="scripts/fixtures/linux-smoke.tex"

appimage_path=$(find "$artifact_dir" -maxdepth 1 -name '*.AppImage' -type f -print -quit)
deb_path=$(find "$artifact_dir" -maxdepth 1 -name '*.deb' -type f -print -quit)

if [ -z "$appimage_path" ] || [ -z "$deb_path" ]; then
  echo "Error: expected one AppImage and one Debian package in $artifact_dir" >&2
  find "$artifact_dir" -maxdepth 1 -type f -print >&2 || true
  exit 1
fi

appimage_path=$(realpath "$appimage_path")
deb_path=$(realpath "$deb_path")

if [ ! -f "$fixture_path" ]; then
  echo "Error: compile fixture not found at $fixture_path" >&2
  exit 1
fi

chmod +x "$appimage_path"

new_test_home() {
  local test_root
  test_root=$(mktemp -d)
  mkdir -p "$test_root/config" "$test_root/cache" "$test_root/runtime"
  chmod 700 "$test_root/runtime"
  printf '%s\n' "$test_root"
}

run_compile_test() {
  local label="$1"
  shift

  local test_root project_dir
  test_root=$(new_test_home)
  project_dir=$(mktemp -d)
  cp "$fixture_path" "$project_dir/main.tex"

  echo "==> Compiling the fixture with $label"
  timeout 300s env \
    HOME="$test_root" \
    XDG_CONFIG_HOME="$test_root/config" \
    XDG_CACHE_HOME="$test_root/cache" \
    XDG_RUNTIME_DIR="$test_root/runtime" \
    "$@" --tectonic-compile "$project_dir" main.tex

  if [ ! -s "$project_dir/main.pdf" ] || ! head -c 5 "$project_dir/main.pdf" | grep -q '%PDF-'; then
    echo "Error: $label did not produce a valid PDF" >&2
    find "$project_dir" -maxdepth 1 -type f -print >&2
    exit 1
  fi
}

run_gui_test() {
  local label="$1"
  shift

  local test_root log_path status
  test_root=$(new_test_home)
  log_path="$test_root/gui.log"

  echo "==> Launching $label under Xvfb"
  set +e
  timeout 30s dbus-run-session -- xvfb-run -a env \
    HOME="$test_root" \
    XDG_CONFIG_HOME="$test_root/config" \
    XDG_CACHE_HOME="$test_root/cache" \
    XDG_RUNTIME_DIR="$test_root/runtime" \
    GSETTINGS_BACKEND=memory \
    LIBGL_ALWAYS_SOFTWARE=1 \
    NO_AT_BRIDGE=1 \
    WEBKIT_DISABLE_DMABUF_RENDERER=1 \
    "$@" >"$log_path" 2>&1
  status=$?
  set -e

  if [ "$status" -ne 124 ]; then
    echo "Error: $label exited before the 30-second startup window (status $status)" >&2
    cat "$log_path" >&2
    exit 1
  fi

  echo "$label remained running for the full startup window"
}

run_compile_test "AppImage" env APPIMAGE_EXTRACT_AND_RUN=1 "$appimage_path"
run_gui_test "AppImage" env APPIMAGE_EXTRACT_AND_RUN=1 "$appimage_path"

echo "==> Installing Debian package and declared runtime dependencies"
sudo apt-get install -y "$deb_path"

deb_binary=$(dpkg-deb --contents "$deb_path" | awk '$6 ~ /^(\.\/)?usr\/bin\/[^/]+$/ {
  sub(/^\.\//, "", $6)
  print "/" $6
  exit
}')

if [ -z "$deb_binary" ] || [ ! -x "$deb_binary" ]; then
  echo "Error: could not locate the installed Debian executable" >&2
  dpkg-deb --contents "$deb_path" >&2
  exit 1
fi

run_compile_test "Debian package" "$deb_binary"
run_gui_test "Debian package" "$deb_binary"

echo "Linux package smoke tests passed"
