# syntax=docker/dockerfile:1
FROM rust:1.75-bookworm AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/iso-recorder /usr/local/bin/iso-recorder
ENV JUNCTION_ISO_PATH_PREFIXES=/var/junction,/tmp,/mnt
ENV JUNCTION_ISO_MIN_FREE_MB=1024
EXPOSE 9011
CMD ["iso-recorder"]
