# Junction warm standby (carbon-copy control plane)

This runbook matches the **Server control** fields `standbyDashboardUrl`, `standbyVisionHttpUrl`, and `standbyProcedureNotes`, plus the dashboard **backup bundle**.

## Principles

1. **One brain for live routing** — Only one **primary** Vision + operator cluster should command **program** at a time. A second stack is **warm** or **offline** until promotion.
2. **ISO redundancy is separate** — **Primary + backup** `iso-recorder` agents (recording rack) give **file-level** redundancy without duplicating the whole control plane.
3. **Config is the product** — Operator JSON under `ui/dashboard/data/` (including `recording-rack.json`, `server-config.json`) is what makes the spare look like the primary after sync.

## Promotion (high level)

1. Stop or isolate the **failing** primary so it cannot still drive routing (network isolate / power / systemd stop — your SOP).
2. On the **standby** host: sync latest **`data/`** from backup export or `rsync` (see `scripts/junction-standby-sync.sh`).
3. Point operators at the **standby dashboard** URL; set **`visionHttpUrl`** (or env) on the standby to the **standby Vision** if it differs.
4. Re-run **`/readiness`** and **`/recording-rack`**; confirm **ISO** agents reachable.
5. Document the event in **observability** / crew comms.

## Sync script

From repo root, after setting `JUNCTION_PRIMARY` to `user@host:/path/to/junction-core-os/ui/dashboard/data`:

```bash
chmod +x scripts/junction-standby-sync.sh
JUNCTION_PRIMARY='ops@10.0.0.1:/opt/junction/ui/dashboard/data' ./scripts/junction-standby-sync.sh
```

Adjust paths to match your install. Prefer **SSH + rsync** on a trusted management network; the dashboard **Backup** UI remains the portable fallback when rsync is not available.
