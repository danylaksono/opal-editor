# Local CI-parity Linux release build

Reproduce the `.github/workflows/release.yml` **Linux** build on your own
machine, so you can validate build/link changes in minutes instead of pushing a
tag and waiting ~17 min for GitHub Actions.

This mirrors the ubuntu-22.04 runner: the same apt deps, static vcpkg
dependencies (`harfbuzz[graphite2]`, `freetype`, `icu`, `fontconfig` on the
`x64-linux` triplet), and the same pkg-config linking strategy the workflow
uses. It exists because the Linux static-linking path breaks in ways a plain
`cargo build` on the host does not surface.

## Requirements

- Docker (Docker Desktop on Windows/macOS; the engine must be running).
- On Windows, run from **Git Bash** (the launcher relies on POSIX `sh`).

## Usage

```bash
# fastest: build + link + dependency-closure audit (the step CI historically fails)
scripts/ci-linux-repro/run.sh

# also produce the .deb and AppImage bundles
scripts/ci-linux-repro/run.sh full

# force a rebuild of the base image (after editing the Dockerfile)
scripts/ci-linux-repro/run.sh --rebuild-image
```

First run is ~15-20 min (image build + vcpkg static deps + full compile).
Subsequent runs relink in a few minutes: the vcpkg tree lives in the
`opal-vcpkg` volume and the cargo registry + build target live in `opal-cache`,
so only your source changes are recompiled.

## What it checks

`container-build.sh` ends by replicating the forbidden-dependency check from
`scripts/audit-linux-bundle.sh`: the release binary must **not** carry a dynamic
`NEEDED` entry for ICU / HarfBuzz / Graphite2 / FreeType / Fontconfig / PNG /
OpenSSL — those must be statically linked so the package is portable across
distros. GTK / WebKit / glib stay dynamic (resolved on the target machine).

## Keeping it in sync with CI

The dep-resolution env in `container-build.sh` must match the
"Install static Tectonic dependencies" step in `.github/workflows/release.yml`:

- `TECTONIC_DEP_BACKEND=pkg-config`
- `PKG_CONFIG_PATH` pointing at the vcpkg `.pc` directory
- `CXXFLAGS=-std=c++17`
- **no** `PKG_CONFIG_ALL_STATIC` (it would force GTK/WebKit static and pull in
  an unavailable `-lsystemd`)

If you change the linking strategy in one place, change it in the other.

## Cleanup

```bash
docker rm -f opal-repro 2>/dev/null || true
docker volume rm opal-work opal-cache opal-vcpkg   # frees the caches (~GBs)
docker image rm opal-repro:22.04
```
