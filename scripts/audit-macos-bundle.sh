#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <target-triple> <expected-architecture> <maximum-deployment-target>" >&2
  exit 2
fi

target_triple="$1"
expected_architecture="$2"
maximum_deployment_target="$3"
bundle_root="apps/desktop/src-tauri/target/$target_triple/release/bundle"
app_path="$bundle_root/macos/Opal.app"
binary_path="$app_path/Contents/MacOS/tectonic-editor-desktop"

if [ ! -f "$binary_path" ]; then
  echo "Error: macOS application binary not found at $binary_path" >&2
  exit 1
fi

echo "==> Verifying macOS architecture"
binary_description=$(file "$binary_path")
echo "$binary_description"
if [[ "$binary_description" != *"$expected_architecture"* ]]; then
  echo "Error: expected architecture $expected_architecture" >&2
  exit 1
fi

echo "==> Auditing Mach-O dependency paths"
bad_dependencies=""
bad_deployment_targets=""
while IFS= read -r -d '' candidate; do
  if ! file "$candidate" | grep -q 'Mach-O'; then
    continue
  fi

  echo "--- $candidate"
  dependencies=$(otool -L "$candidate")
  echo "$dependencies"
  candidate_bad=$(printf '%s\n' "$dependencies" | awk 'NR > 1 {
    dependency = $1
    if (dependency !~ /^\/System\/Library\// &&
        dependency !~ /^\/usr\/lib\// &&
        dependency !~ /^@rpath\// &&
        dependency !~ /^@loader_path\// &&
        dependency !~ /^@executable_path\//) {
      print
    }
  }')
  if [ -n "$candidate_bad" ]; then
    bad_dependencies+="$candidate_bad"$'\n'
  fi

  build_details=$(vtool -show-build "$candidate")
  candidate_target=$(printf '%s\n' "$build_details" | awk '$1 == "minos" { print $2; exit }')
  if [ -z "$candidate_target" ]; then
    echo "Error: could not determine the macOS deployment target for $candidate" >&2
    exit 1
  fi

  echo "minimum macOS: $candidate_target"
  if ! awk -v actual="$candidate_target" -v maximum="$maximum_deployment_target" 'BEGIN {
    split(actual, a, "."); split(maximum, m, ".");
    exit !((a[1] + 0 < m[1] + 0) || (a[1] + 0 == m[1] + 0 && a[2] + 0 <= m[2] + 0));
  }'; then
    bad_deployment_targets+="$candidate requires macOS $candidate_target"$'\n'
  fi
done < <(find "$app_path" -type f -print0)

if [ -n "$bad_dependencies" ]; then
  echo "Error: the application contains non-system absolute dependency paths:" >&2
  printf '%s' "$bad_dependencies" >&2
  exit 1
fi

if [ -n "$bad_deployment_targets" ]; then
  echo "Error: Mach-O files exceed the supported macOS $maximum_deployment_target deployment target:" >&2
  printf '%s' "$bad_deployment_targets" >&2
  exit 1
fi

echo "==> Verifying Developer ID signature"
codesign --verify --deep --strict --verbose=4 "$app_path"
codesign_details=$(codesign --display --verbose=4 "$app_path" 2>&1)
echo "$codesign_details"
if ! printf '%s\n' "$codesign_details" | grep -q '^Authority=Developer ID Application:'; then
  echo "Error: Opal.app is not signed with a Developer ID Application certificate" >&2
  exit 1
fi
if ! printf '%s\n' "$codesign_details" | grep -Eq '^CodeDirectory .*flags=.*\(.*runtime.*\)'; then
  echo "Error: Opal.app is not signed with the hardened runtime" >&2
  exit 1
fi

echo "==> Verifying Gatekeeper assessment"
spctl --assess --type execute --verbose=4 "$app_path"

dmg_path=$(find "$bundle_root/dmg" -maxdepth 1 -name '*.dmg' -type f -print -quit 2>/dev/null || true)
if [ -z "$dmg_path" ]; then
  echo "Error: macOS DMG not found under $bundle_root/dmg" >&2
  exit 1
fi

echo "==> Verifying notarization tickets"
xcrun stapler validate "$app_path"
xcrun stapler validate "$dmg_path"

echo "macOS bundle audit passed"
