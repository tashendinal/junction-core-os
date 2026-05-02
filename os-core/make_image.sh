#!/usr/bin/env bash
# Junction Core OS — minimal Debian 13 (trixie) ARM64 rootfs via debootstrap.
# Produces a tarball suitable for loop-mount, SD imaging, or nspawn.
#
# Requirements (on the build host):
#   - debootstrap, debian-archive-keyring
#   - For cross-build from amd64: qemu-user-static + binfmt_misc (package qemu-user-static on Debian)
#
# Usage:
#   sudo ./make_image.sh
#   TARGET_DIR=/srv/junction-rootfs OUTPUT_TARBALL=junction-arm64-trixie.tar.zst ./make_image.sh
#
set -euo pipefail

SUITE="${SUITE:-trixie}"
ARCH="${ARCH:-arm64}"
MIRROR="${MIRROR:-http://deb.debian.org/debian}"
TARGET_DIR="${TARGET_DIR:-$(pwd)/build/arm64-trixie-rootfs}"
OUTPUT_TARBALL="${OUTPUT_TARBALL:-$(pwd)/build/junction-arm64-${SUITE}-rootfs.tar.zst}"
INCLUDE_PKGS="${INCLUDE_PKGS:-systemd,systemd-sysv,sudo,openssh-server,ca-certificates,iproute2,iputils-ping,isc-dhcp-client,udev}"

die() { echo "ERROR: $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "Run as root (debootstrap needs chroot and device ownership)."

mkdir -p "$(dirname "$TARGET_DIR")" "$(dirname "$OUTPUT_TARBALL")"
rm -rf "$TARGET_DIR"

echo "[1/4] debootstrap --foreign ($SUITE $ARCH)"
debootstrap --foreign --arch="$ARCH" \
  --include="$INCLUDE_PKGS" \
  "$SUITE" "$TARGET_DIR" "$MIRROR"

QEMU_STATIC="/usr/bin/qemu-aarch64-static"
if [[ "$ARCH" == "arm64" ]] && [[ -x "$QEMU_STATIC" ]]; then
  if ! arch | grep -q aarch64 2>/dev/null; then
    echo "[info] Installing qemu-aarch64-static into chroot for second-stage on non-ARM host"
    cp -a "$QEMU_STATIC" "$TARGET_DIR/usr/bin/" || true
  fi
fi

echo "[2/4] debootstrap second-stage (inside chroot)"
mount_chroot() {
  mount --bind /dev "$TARGET_DIR/dev"
  mount --bind /dev/pts "$TARGET_DIR/dev/pts" 2>/dev/null || true
  mount -t proc proc "$TARGET_DIR/proc"
  mount -t sysfs sys "$TARGET_DIR/sys"
  mount -t tmpfs tmpfs "$TARGET_DIR/run"
}
umount_chroot() {
  umount "$TARGET_DIR/run" 2>/dev/null || true
  umount "$TARGET_DIR/sys" 2>/dev/null || true
  umount "$TARGET_DIR/proc" 2>/dev/null || true
  umount "$TARGET_DIR/dev/pts" 2>/dev/null || true
  umount "$TARGET_DIR/dev" 2>/dev/null || true
}
mount_chroot
chroot "$TARGET_DIR" /debootstrap/debootstrap --second-stage

echo "[3/4] Base configuration"
chroot "$TARGET_DIR" bash -s <<'CHROOT'
set -e
echo "junction-core" > /etc/hostname
cat > /etc/hosts <<'EOF'
127.0.0.1	localhost
127.0.1.1	junction-core
::1		localhost ip6-localhost ip6-loopback
EOF
# Enable root login only via key in production — placeholder:
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config 2>/dev/null || true
# Journald persistent
mkdir -p /var/log/journal
# Junction state dirs (populated by first-boot or image customization)
mkdir -p /etc/junction /var/lib/junction
CHROOT

umount_chroot

echo "[4/4] Pack tarball: $OUTPUT_TARBALL"
if command -v zstd >/dev/null 2>&1; then
  tar -C "$TARGET_DIR" -cf - . | zstd -19 -o "$OUTPUT_TARBALL"
else
  OUTPUT_TARBALL="${OUTPUT_TARBALL%.zst}.tar.gz"
  tar -C "$TARGET_DIR" -czf "$OUTPUT_TARBALL" .
  echo "[info] zstd not found; wrote gzip: $OUTPUT_TARBALL"
fi

echo "Done."
echo "  Rootfs: $TARGET_DIR"
echo "  Archive: $OUTPUT_TARBALL"
echo "Flash example (adjust /dev/sdX):"
echo "  sudo tar -C /mnt/root -xaf $OUTPUT_TARBALL"
