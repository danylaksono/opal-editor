#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: $0 <semver-version> [bundle-directory]" >&2
  exit 2
fi

app_version="$1"
if [[ "$app_version" != *-* ]]; then
  echo "Stable version $app_version needs no Debian normalization"
  exit 0
fi

deb_version="${app_version%%-*}~${app_version#*-}"
bundle_dir="${2:-apps/desktop/src-tauri/target/release/bundle/deb}"
deb_path=$(find "$bundle_dir" -maxdepth 1 -name '*.deb' -type f -print -quit)

if [ -z "$deb_path" ]; then
  echo "Error: Debian package not found under $bundle_dir" >&2
  exit 1
fi

current_version=$(dpkg-deb --field "$deb_path" Version)
if [ "$current_version" != "$app_version" ]; then
  echo "Error: generated Debian version is $current_version; expected $app_version before normalization" >&2
  exit 1
fi

work_dir=$(mktemp -d)
repacked_path="$work_dir/repacked.deb"
dpkg-deb --raw-extract "$deb_path" "$work_dir/package"

sed -i "s/^Version: .*/Version: $deb_version/" "$work_dir/package/DEBIAN/control"
dpkg-deb --build --root-owner-group "$work_dir/package" "$repacked_path"
mv "$repacked_path" "$deb_path"

normalized_version=$(dpkg-deb --field "$deb_path" Version)
if [ "$normalized_version" != "$deb_version" ]; then
  echo "Error: Debian normalization produced $normalized_version; expected $deb_version" >&2
  exit 1
fi

stable_version="${app_version%%-*}"
if ! dpkg --compare-versions "$stable_version" gt "$normalized_version"; then
  echo "Error: stable $stable_version would not upgrade prerelease $normalized_version" >&2
  exit 1
fi

echo "Normalized Debian package version: $app_version -> $normalized_version"
