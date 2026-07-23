# Repository agent guidance

## Release pipeline contract

Future releases must use a gated build, verification, and publication pipeline. A successful compile is not sufficient evidence that an installer works on a clean machine.

The required sequence is:

1. Build platform packages without making a public release.
2. Audit architecture and native dependency closure.
3. Install or mount the resulting packages in clean supported environments.
4. Launch Opal with an isolated home/configuration directory and compile a bundled LaTeX example.
5. Apply and verify platform signing and notarization.
6. Stage updater artifacts and generate `latest.json` once, after all platform assets are final.
7. Publish the GitHub release only after every required job passes.

GitHub releases must remain drafts during build and verification. Do not use a build-and-publish step that can expose artifacts before the verification gates finish.

## Native dependency policy

- macOS Mach-O dependencies must resolve through system paths or bundle-relative `@rpath`, `@loader_path`, or `@executable_path` references, never through build-machine paths such as Homebrew prefixes.
- Linux native packages must not directly require a build-distribution-specific ICU, HarfBuzz, Graphite, FreeType, Fontconfig, PNG, or OpenSSL soname.
- Use Tectonic's vcpkg backend with static platform triplets and its `native-tls-vendored` feature for release builds. The supported triplets are `x64-linux`, `arm64-osx`, `x64-osx`, and the existing Windows static triplet. Semi-static pkg-config mode (`TECTONIC_PKGCONFIG_FORCE_SEMI_STATIC=1`) is acceptable only if the artifact audit proves that every required archive was available; Ubuntu's development packages do not currently satisfy that condition. If static linking cannot produce portable macOS artifacts, bundle every non-system dylib under `Opal.app/Contents/Frameworks`, rewrite its install name to an `@rpath`-relative path, and sign only after rewriting is complete.
- Removing `external-harfbuzz` alone is not a complete fix because Tectonic still depends on ICU, Graphite, and FreeType.

## Platform release gates

### macOS Intel and Apple Silicon

- Build each architecture on its native GitHub runner.
- Reject every Mach-O dependency outside system paths and bundle-relative `@rpath`, `@loader_path`, or `@executable_path` references.
- Require a Developer ID Application signature, hardened runtime, successful Gatekeeper assessment, notarization, and stapled tickets for both the application and DMG.
- Verify the executable architecture and minimum supported macOS version.
- Mount the DMG and launch the copied application from a clean user context.

Required CI secrets are expected to include the updater signing key plus an Apple Developer ID certificate and App Store Connect notarization credentials. Tauri updater signing and Apple application signing are separate requirements.

The release workflow currently expects these secret names:

- `TAURI_PRIVATE_KEY` and `TAURI_KEY_PASSWORD` for updater artifacts.
- `APPLE_CERTIFICATE`: single-line base64-encoded Developer ID Application `.p12` certificate.
- `APPLE_CERTIFICATE_PASSWORD`: password for that `.p12` certificate.
- `APPLE_SIGNING_IDENTITY`: full Developer ID Application identity.
- `APPLE_API_ISSUER`: App Store Connect API issuer UUID.
- `APPLE_API_KEY`: App Store Connect API key ID.
- `APPLE_API_KEY_BASE64`: single-line base64-encoded contents of the matching `.p8` private key.

### Linux AppImage and Debian package

- Build on Ubuntu 22.04, the oldest supported baseline.
- Test the AppImage and Debian package on clean Ubuntu 22.04 and Ubuntu 24.04 environments.
- Run dependency closure checks and reject `not found` results.
- Launch under Xvfb with isolated `HOME`, `XDG_CONFIG_HOME`, and `XDG_CACHE_HOME` directories.
- Verify that an included LaTeX example compiles and produces a PDF.
- Treat AppImage as the default Linux download until native packages pass the wider compatibility matrix.

### RPM

RPM publication is paused. Do not produce a release RPM from the Ubuntu job. Restore it only after adding a Fedora-native build job, correct RPM dependency metadata, and clean install/launch tests on the oldest and newest supported Fedora releases.

### Windows

Keep the existing x86_64 installer build, updater signature verification, and a clean install/launch regression test. Windows success does not waive failures on other required platforms.

## Release progression

Use a prerelease such as `v1.4.2-rc.1` for the first portable-package candidate. Before promotion to a stable release, obtain confirmation from Intel macOS, Apple Silicon macOS, Ubuntu 22.04, Ubuntu 24.04, current Fedora if RPM is restored, and Windows.

Keep the compatibility notice in `docs/index.html` until those gates and external confirmations pass. Update or remove the notice in the same change that promotes the verified stable release.

The scripts under `scripts/build-*.{sh,ps1}` predate this contract. Treat them as local development helpers, not as authorization to publish production assets directly; production releases use `.github/workflows/release.yml`.

## Current implementation status

The repository currently stages release assets into a draft, builds Tectonic's macOS and Linux dependencies through static vcpkg triplets, vendors Tectonic's native TLS implementation, pauses RPM generation, audits macOS Homebrew paths/signing/notarization, and audits Linux native dependency closure. It intentionally leaves the release as a draft because the clean-machine gates and updater-manifest consolidation below are not implemented yet.

Before the first release candidate, complete these remaining pipeline items:

1. Add clean Ubuntu 22.04 and Ubuntu 24.04 install/launch/compile jobs for the AppImage and Debian package.
2. Consolidate updater-manifest generation into one final job rather than relying on parallel platform uploads.
3. Add a DMG mount/copy/launch smoke test after the macOS dependency and signing audit.
4. Add a clean Windows install/launch regression job.
5. Add the final publication job only after the required verification jobs and updater manifest succeed.
6. Restore RPM only with its Fedora-native build and verification matrix.
