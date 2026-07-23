# CI-parity build environment for the Opal Linux release.
#
# Mirrors the ubuntu-22.04 GitHub runner used by .github/workflows/release.yml
# so the Linux release build (which links Tectonic's native deps statically and
# is the part that historically breaks) can be reproduced locally in minutes
# instead of waiting ~17 min per GitHub Actions run.
#
# The heavy apt / Rust / Node layers are baked into the image. The vcpkg tree
# and the cargo registry+target live in named volumes (see run.sh) so that a
# rebuild only pays for rsync + a cargo relink.
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Base toolchain + the exact apt deps release.yml installs on the Linux runner
# (including the autotools that vcpkg's gperf/fontconfig ports now require).
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates git build-essential pkg-config cmake ninja-build \
      zip unzip tar file python3 rsync \
      libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev \
      patchelf libssl-dev \
      autoconf autoconf-archive automake libtool \
 && rm -rf /var/lib/apt/lists/*

# Node 22 + pnpm (matches release.yml's setup-node + corepack).
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y nodejs \
 && corepack enable && corepack prepare pnpm@latest --activate \
 && rm -rf /var/lib/apt/lists/*

# Rust stable, baked into the image (not a volume).
ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo
ENV PATH=/opt/cargo/bin:$PATH
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
      sh -s -- -y --profile minimal --default-toolchain stable

COPY container-build.sh /usr/local/bin/container-build.sh
RUN chmod +x /usr/local/bin/container-build.sh
ENTRYPOINT ["/usr/local/bin/container-build.sh"]
