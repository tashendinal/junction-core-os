# syntax=docker/dockerfile:1

FROM rust:1.75-slim-bookworm AS builder

WORKDIR /app

# Optional: pass NDI_SDK_URL at build time when libndi-dev is unavailable.
# Example:
#   docker build --build-arg NDI_SDK_URL="https://downloads.ndi.tv/SDK/NDI_SDK_Linux.tar.gz" .
ARG NDI_SDK_URL=""

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        pkg-config \
        libndi-dev \
    || true

RUN if ! dpkg -s libndi-dev >/dev/null 2>&1; then \
      echo "libndi-dev package not found in apt repositories."; \
      echo "Provide --build-arg NDI_SDK_URL=<linux-sdk-tarball-url> to install NDI SDK manually."; \
      test -n "${NDI_SDK_URL}" || exit 1; \
      apt-get update && apt-get install -y --no-install-recommends tar && rm -rf /var/lib/apt/lists/*; \
      curl -fsSL "${NDI_SDK_URL}" -o /tmp/ndi-sdk.tar.gz; \
      mkdir -p /tmp/ndi-sdk && tar -xzf /tmp/ndi-sdk.tar.gz -C /tmp/ndi-sdk; \
      if [ -d /tmp/ndi-sdk/lib/x86_64-linux-gnu ]; then cp -a /tmp/ndi-sdk/lib/x86_64-linux-gnu/. /usr/lib/x86_64-linux-gnu/; fi; \
      if [ -d /tmp/ndi-sdk/include ]; then cp -a /tmp/ndi-sdk/include/. /usr/include/; fi; \
      ldconfig; \
    fi

COPY Cargo.toml ./
COPY src ./src

RUN cargo build --release

FROM debian:bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libndi-dev \
    || true

# If libndi-dev is unavailable in runtime repos, copy the shared library from builder.
COPY --from=builder /usr/lib/x86_64-linux-gnu/libndi.so* /usr/lib/x86_64-linux-gnu/
RUN ldconfig || true

COPY --from=builder /app/target/release/vision /usr/local/bin/vision

EXPOSE 9000

CMD ["vision"]
