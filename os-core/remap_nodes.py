#!/usr/bin/env python3
"""
Listen for Junction node-agent UDP heartbeats and merge live telemetry into cluster.json.

Default: bind :47777, update ../../os-core/cluster.json when run from repo tools,
  or set --cluster /etc/junction/cluster.json on a rack controller.

Heartbeats (JSON): node_id, ip, thermal, role, hw_id (optional)
"""

from __future__ import annotations

import argparse
import json
import socket
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class SeenNode:
    node_id: str
    ip: str
    thermal: str
    role: str
    hw_id: str
    last_ts: float = field(default_factory=time.time)


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": 1, "slots": []}
    return json.loads(path.read_text(encoding="utf-8"))


def load_ip_map(path: Path | None) -> dict[str, Any]:
    if not path or not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def functional_label(role: str) -> str:
    r = (role or "").strip().lower().replace(" ", "_")
    if r in ("vision",):
        return "Vision"
    if r in ("archive",):
        return "Primary Archive"
    if r in ("ai_matcher", "ai-matcher", "matcher"):
        return "AI Matcher"
    if r in ("unknown", "", "n/a"):
        return "Unassigned"
    return role.replace("_", " ").title()


def slot_for_node(
    node_id: str,
    ip: str,
    ip_map: dict[str, Any],
    prev_slots: list[dict[str, Any]],
) -> tuple[int, str, str]:
    """Return (u_position, node_label, hw_id hint from map or prior)."""
    nodes = ip_map.get("nodes") if ip_map else None
    if isinstance(nodes, dict) and node_id in nodes:
        entry = nodes[node_id]
        u = int(entry.get("rack_u", int(node_id) if node_id.isdigit() else 1))
        label = f"Node {node_id}"
        hid = str(entry.get("hw_id", ""))
        return u, label, hid

    for s in prev_slots:
        lbl = str(s.get("node_label", ""))
        if lbl.endswith(node_id) or lbl == f"Node {node_id}":
            return (
                int(s.get("u_position", 0)),
                lbl,
                str(s.get("hw_id", "")),
            )
        if str(s.get("ip_address", "")) == ip:
            return (
                int(s.get("u_position", 0)),
                lbl,
                str(s.get("hw_id", "")),
            )

    try:
        n = int(str(node_id).lstrip("0") or "0")
    except ValueError:
        n = sum(ord(c) for c in node_id) % 42 + 1
    return max(1, min(52, n)), f"Node {node_id}", ""


def merge_cluster(
    doc: dict[str, Any],
    alive: dict[str, SeenNode],
    ip_map: dict[str, Any],
) -> dict[str, Any]:
    prev_slots = list(doc.get("slots") or [])
    by_u: dict[int, dict[str, Any]] = {}
    for s in prev_slots:
        try:
            by_u[int(s["u_position"])] = dict(s)
        except (KeyError, TypeError, ValueError):
            continue

    for node_id, info in sorted(alive.items(), key=lambda x: x[0]):
        u, label, map_hw = slot_for_node(node_id, info.ip, ip_map, prev_slots)
        hw = info.hw_id or map_hw or f"HW-PENDING-{node_id}"
        entry = {
            "u_position": u,
            "node_label": label,
            "hw_id": hw,
            "ip_address": info.ip,
            "functional_role": functional_label(info.role),
            "thermal": info.thermal,
            "agent_role": info.role,
            "last_seen": datetime.now(timezone.utc).isoformat(),
        }
        by_u[u] = entry

    new_slots = [by_u[k] for k in sorted(by_u)]
    return {
        "version": doc.get("version", 1),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "slots": new_slots,
    }


def run_listen(args: argparse.Namespace) -> None:
    cluster_path: Path = args.cluster
    ip_map = load_ip_map(args.ip_map)
    alive: dict[str, SeenNode] = {}

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((args.bind, args.port))
    sock.settimeout(args.write_interval)

    last_write = 0.0
    print(f"remap_nodes: listening on {args.bind}:{args.port} → {cluster_path}", flush=True)

    while True:
        try:
            data, _addr = sock.recvfrom(65535)
        except socket.timeout:
            data = None

        now = time.time()
        if data:
            try:
                p = json.loads(data.decode("utf-8", errors="replace"))
            except json.JSONDecodeError:
                continue
            nid = str(p.get("node_id", "")).strip()
            if not nid:
                continue
            alive[nid] = SeenNode(
                node_id=nid,
                ip=str(p.get("ip", "")),
                thermal=str(p.get("thermal", "n/a")),
                role=str(p.get("role", "unknown")),
                hw_id=str(p.get("hw_id", "")),
                last_ts=now,
            )

        # Drop stale
        stale_before = now - args.stale_sec
        alive = {k: v for k, v in alive.items() if v.last_ts >= stale_before}

        if now - last_write >= args.write_interval and alive:
            doc = load_json(cluster_path)
            out = merge_cluster(doc, alive, ip_map)
            cluster_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = cluster_path.with_suffix(cluster_path.suffix + ".tmp")
            tmp.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
            tmp.replace(cluster_path)
            last_write = now
            print(f"remap_nodes: wrote {len(out['slots'])} slots", flush=True)


def main() -> None:
    ap = argparse.ArgumentParser(description="Junction cluster discovery → cluster.json")
    ap.add_argument("--bind", default="0.0.0.0", help="Listen address")
    ap.add_argument("--port", type=int, default=47777)
    ap.add_argument(
        "--cluster",
        type=Path,
        default=Path(__file__).resolve().parent / "cluster.json",
        help="cluster.json path (Web UI / command-center)",
    )
    ap.add_argument(
        "--ip-map",
        type=Path,
        default=Path(__file__).resolve().parent / "node-ip-map.json",
        help="Static Node ID → IP / rack_u (optional)",
    )
    ap.add_argument("--write-interval", type=float, default=2.0, help="Seconds between disk writes")
    ap.add_argument("--stale-sec", type=float, default=15.0, help="Drop nodes not heard in this window")
    args = ap.parse_args()
    run_listen(args)


if __name__ == "__main__":
    main()
