#!/usr/bin/env bash
# Sync dashboard operator data from primary host to this machine (warm standby).
# Prereq: SSH access; rsync installed on both sides.
#
# Usage:
#   JUNCTION_PRIMARY='user@10.0.0.1:/opt/junction-core-os/ui/dashboard/data' ./scripts/junction-standby-sync.sh
#
# Optional:
#   JUNCTION_STANDY_DATA=/path/to/junction-core-os/ui/dashboard/data  (default: repo-relative below)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DST="${JUNCTION_STANDY_DATA:-$ROOT/ui/dashboard/data}"
SRC="${JUNCTION_PRIMARY:?Set JUNCTION_PRIMARY to user@host:/remote/.../ui/dashboard/data}"

mkdir -p "$DST"
rsync -a --delete "${SRC%/}/" "${DST%/}/"
echo "Synced primary data → $DST"
echo "Restart the standby dashboard process if it is already running."
