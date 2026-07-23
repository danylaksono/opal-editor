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
- Provide Tectonic's native deps (ICU, HarfBuzz, Graphite2, FreeType, Fontconfig) from static vcpkg triplets and keep Tectonic's `native-tls-vendored` feature for release builds. The supported triplets are `x64-linux`, `arm64-osx`, `x64-osx`, and the existing Windows static triplet.
  - **Linux linking mechanism:** use Tectonic's **pkg-config backend** (`TECTONIC_DEP_BACKEND=pkg-config`) pointed at the vcpkg tree's `.pc` directory via `PKG_CONFIG_PATH`, **not** the vcpkg backend. The vcpkg backend under-emits the static closure for `x64-linux` — Graphite2 (HarfBuzz's private dep) and the ICU data/i18n libs never reach the linker, producing `gr_*` / `ucnv_*` / `ubrk_*` undefined-symbol errors. The vcpkg `.pc` files carry the full transitive `Requires` chain, and the vcpkg lib dir ships only static `.a` archives, so these link statically while GTK/WebKit resolve dynamically from the default system pkgconfig paths. Do **not** set `PKG_CONFIG_ALL_STATIC=1`: it forces GTK/WebKit static too and pulls in an unavailable `-lsystemd`. This is linking against the vcpkg static tree, which is distinct from the discouraged semi-static mode against Ubuntu's development packages — those do not ship the required static archives.
  - vcpkg's ICU port requires the build to use `-std=c++17` (`CXXFLAGS`), and its `gperf`/`fontconfig` ports now require `autoconf autoconf-archive automake libtool` on the runner.
  - Windows keeps the vcpkg backend with the static Windows triplet; the pkg-config change is Linux-only.
  - If static linking cannot produce portable macOS artifacts, bundle every non-system dylib under `Opal.app/Contents/Frameworks`, rewrite its install name to an `@rpath`-relative path, and sign only after rewriting is complete.
- Removing `external-harfbuzz` alone is not a complete fix because Tectonic still depends on ICU, Graphite, and FreeType.

## Platform release gates

### macOS Intel and Apple Silicon

macOS ships as an **unsigned** build. Signed and notarized distribution is deferred until the project has sponsorship for the paid Apple Developer Program membership; the two tracks are independent and the unsigned track must not wait on the signed one.

**Unsigned track (current):**

- Build each architecture on its native GitHub runner (`macos-15` for arm64, `macos-15-intel` for x86_64).
- Link Tectonic's native deps statically from the vcpkg tree via the pkg-config backend (`arm64-osx` / `x64-osx` triplets), exactly as the Linux job does. This is what makes the `.app` self-contained and runnable on a clean Mac; a Homebrew-based build (as in v1.4.0) is not acceptable because Tauri does not bundle Homebrew dylibs, so the app would reference absolute `/opt/homebrew` paths and crash off the build machine.
- Pin `MACOSX_DEPLOYMENT_TARGET` before vcpkg builds so the native deps do not raise the app's minimum macOS version.
- Audit the bundle with `scripts/audit-macos-bundle.sh <triple> <arch> <min> unsigned`: it rejects every Mach-O dependency outside system paths and bundle-relative `@rpath`/`@loader_path`/`@executable_path` references (fatal — this is the portability gate), verifies the architecture, and reports the effective minimum macOS version (informational on this track — correct the website copy if it rises above the advertised minimum). It intentionally skips Developer ID, Gatekeeper, and notarization checks.
- Do **not** sign: no `APPLE_*` secrets, no `signingIdentity` in `tauri.conf.json`. The binary keeps its automatic ad-hoc signature so it launches on Apple Silicon once quarantine is cleared.
- The website must disclose that macOS builds are unsigned and document the Gatekeeper bypass (right-click → Open, or `xattr -cr /Applications/Opal.app`). Keep that disclosure until signed builds ship.

**Signed track (deferred until Apple sponsorship):**

- Require a Developer ID Application signature, hardened runtime, successful Gatekeeper assessment, notarization, and stapled tickets for both the application and DMG (run the audit without the `unsigned` argument).
- Mount the DMG and launch the copied application from a clean user context.

Tauri updater signing (`TAURI_PRIVATE_KEY`, free, self-generated) and Apple application signing are separate requirements. When the signed track is restored, the release workflow will require these secret names:

- `TAURI_PRIVATE_KEY` and `TAURI_KEY_PASSWORD` for updater artifacts.
- `APPLE_CERTIFICATE`: single-line base64-encoded Developer ID Application `.p12` certificate.
- `APPLE_CERTIFICATE_PASSWORD`: password for that `.p12` certificate.
- `APPLE_SIGNING_IDENTITY`: full Developer ID Application identity.
- `APPLE_API_ISSUER`: App Store Connect API issuer UUID.
- `APPLE_API_KEY`: App Store Connect API key ID.
- `APPLE_API_KEY_BASE64`: single-line base64-encoded contents of the matching `.p8` private key.

### Linux AppImage and Debian package

- **Reproduce Linux build/link changes locally before pushing a release tag.** The Linux static-linking path breaks in ways a host `cargo build` does not surface, and each GitHub release run costs ~17 min. Run `scripts/ci-linux-repro/run.sh` (Docker, ubuntu-22.04 parity) to validate the compile, link, and dependency-closure audit locally first; only tag once it passes. Use `run.sh full` to also produce the `.deb` and AppImage bundles. Keep the dep-resolution env in `scripts/ci-linux-repro/container-build.sh` in sync with the "Install static Tectonic dependencies" step in `release.yml`.
- Build on Ubuntu 22.04, the oldest supported baseline.
- Test the AppImage and Debian package on clean Ubuntu 22.04 and Ubuntu 24.04 environments.
- Run dependency closure checks and reject `not found` results.
- For SemVer prereleases, rewrite only the Debian control version from forms such as `1.4.2-rc.1` to `1.4.2~rc.1`, replace the staged `.deb`, remove any signature made for the pre-normalized archive, and verify with `dpkg --compare-versions` that stable `1.4.2` is newer.
- Launch under Xvfb with isolated `HOME`, `XDG_CONFIG_HOME`, and `XDG_CACHE_HOME` directories.
- Verify that an included LaTeX example compiles and produces a PDF.
- Treat AppImage as the default Linux download until native packages pass the wider compatibility matrix.

### RPM

RPM publication is paused. Do not produce a release RPM from the Ubuntu job. Restore it only after adding a Fedora-native build job, correct RPM dependency metadata, and clean install/launch tests on the oldest and newest supported Fedora releases.

### Windows

Keep the existing x86_64 installer build, updater signature verification, and a clean install/launch regression test. Windows success does not waive failures on other required platforms.

## Release progression

Use a prerelease such as `v1.4.2-rc.1` for the first portable Linux-package candidate. Before promotion to a stable Windows/Linux release, obtain confirmation from Ubuntu 22.04, Ubuntu 24.04, and Windows. Unsigned macOS builds ship alongside these but must be advertised as unsigned (with the Gatekeeper-bypass instructions) and confirmed to launch on a clean Mac before being called supported. Signed/notarized macOS and RPM remain separate future tracks and must not be advertised until their own gates pass.

Keep the compatibility notice in `docs/index.html` until those gates and external confirmations pass. Update or remove the notice in the same change that promotes the verified stable release.

The scripts under `scripts/build-*.{sh,ps1}` predate this contract. Treat them as local development helpers, not as authorization to publish production assets directly; production releases use `.github/workflows/release.yml`.

## Current implementation status

The repository currently stages Windows, Linux, and unsigned macOS (arm64 + x86_64) release assets into a draft, links Tectonic's Linux and macOS native deps statically from vcpkg via the pkg-config backend, vendors Tectonic's native TLS implementation, pauses signed macOS and RPM generation, and audits native dependency closure on Linux and macOS. Clean Ubuntu 22.04 and Ubuntu 24.04 jobs test both the AppImage and Debian package by compiling a LaTeX fixture and keeping the GUI alive under Xvfb. The workflow intentionally leaves the release as a draft because updater-manifest consolidation and the remaining gates below are not implemented yet.

Before publishing the first release candidate, complete these remaining pipeline items:

1. Consolidate updater-manifest generation into one final job rather than relying on parallel platform uploads.
2. Add a clean Windows install/launch regression job.
3. Add the final publication job only after the required verification jobs and updater manifest succeed.
4. Add a clean-Mac install/launch smoke test for the unsigned macOS builds (blocked on access to macOS runners with a GUI or a manual tester), then upgrade the macOS track to Developer ID signing and notarization once Apple sponsorship is available.
5. Restore RPM only with its Fedora-native build and verification matrix.
