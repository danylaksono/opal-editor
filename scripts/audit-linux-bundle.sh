#!/usr/bin/env bash
set -euo pipefail

bundle_root="apps/desktop/src-tauri/target/release/bundle"
binary_path="apps/desktop/src-tauri/target/release/tectonic-editor-desktop"

if [ ! -f "$binary_path" ]; then
  echo "Error: Linux application binary not found at $binary_path" >&2
  exit 1
fi

echo "==> Verifying Linux architecture"
binary_description=$(file "$binary_path")
echo "$binary_description"
if [[ "$binary_description" != *"x86-64"* ]]; then
  echo "Error: expected an x86-64 Linux executable" >&2
  exit 1
fi

echo "==> Auditing direct ELF dependencies"
dynamic_section=$(readelf -d "$binary_path")
echo "$dynamic_section" | grep -E 'NEEDED|RPATH|RUNPATH' || true

forbidden_pattern='lib(icu[^ ]*|harfbuzz|graphite2|freetype|fontconfig|png[^ ]*|ssl|crypto)\.so'
bad_dependencies=$(printf '%s\n' "$dynamic_section" | grep -E "$forbidden_pattern" || true)
if [ -n "$bad_dependencies" ]; then
  echo "Error: Linux executable still depends on native libraries that must be portable or bundled:" >&2
  printf '%s\n' "$bad_dependencies" >&2
  exit 1
fi

echo "==> Checking build-runner dependency closure"
unresolved=$(ldd "$binary_path" | grep 'not found' || true)
if [ -n "$unresolved" ]; then
  echo "Error: unresolved Linux dependencies:" >&2
  printf '%s\n' "$unresolved" >&2
  exit 1
fi

deb_path=$(find "$bundle_root/deb" -maxdepth 1 -name '*.deb' -type f -print -quit 2>/dev/null || true)
appimage_path=$(find "$bundle_root/appimage" -maxdepth 1 -name '*.AppImage' -type f -print -quit 2>/dev/null || true)

if [ -z "$deb_path" ] || [ -z "$appimage_path" ]; then
  echo "Error: expected both Debian and AppImage bundles" >&2
  exit 1
fi

if find "$bundle_root/rpm" -maxdepth 1 -name '*.rpm' -type f -print -quit 2>/dev/null | grep -q .; then
  echo "Error: RPM publishing is paused until a native Fedora build-and-test job exists" >&2
  exit 1
fi

echo "==> Debian package metadata"
dpkg-deb --field "$deb_path" Package Version Architecture Depends

app_version=$(node -p "require('./package.json').version")
expected_deb_version="$app_version"
if [[ "$app_version" == *-* ]]; then
  expected_deb_version="${app_version%%-*}~${app_version#*-}"
fi

actual_deb_version=$(dpkg-deb --field "$deb_path" Version)
if [ "$actual_deb_version" != "$expected_deb_version" ]; then
  echo "Error: Debian package version is $actual_deb_version; expected $expected_deb_version" >&2
  exit 1
fi

if [[ "$app_version" == *-* ]]; then
  stable_version="${app_version%%-*}"
  if ! dpkg --compare-versions "$stable_version" gt "$actual_deb_version"; then
    echo "Error: Debian would not treat stable $stable_version as an upgrade from $actual_deb_version" >&2
    exit 1
  fi
fi

echo "Linux bundle audit passed"
