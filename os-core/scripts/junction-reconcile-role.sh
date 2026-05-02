#!/usr/bin/env bash
# Compare /etc/junction/cluster.json (desired layout from Web UI / remap_nodes) with
# this host's /etc/junction/node_role and restart the correct Docker stack profile.
#
# Environment:
#   JUNCTION_STATE_DIR   default /etc/junction
#   JUNCTION_REPO        path to junction-core-os checkout (docker-compose.yml)
#   JUNCTION_BIND_IFACE  interface for primary IP (optional)
#
set -euo pipefail

STATE="${JUNCTION_STATE_DIR:-/etc/junction}"
if [[ -f "${STATE}/cluster.json" ]]; then
  CLUSTER_JSON="${STATE}/cluster.json"
elif [[ -f /var/lib/junction/cluster.json ]]; then
  CLUSTER_JSON="/var/lib/junction/cluster.json"
else
  CLUSTER_JSON="${STATE}/cluster.json"
fi
ROLE_FILE="${STATE}/node_role"
NODE_ID_FILE="${STATE}/node_id"
IP_MAP="${STATE}/node-ip-map.json"
REPO="${JUNCTION_REPO:-/opt/junction-core-os}"

log() { echo "[junction-reconcile] $*"; }

primary_ip() {
  if [[ -n "${JUNCTION_BIND_IFACE:-}" ]]; then
    ip -4 -br addr show dev "$JUNCTION_BIND_IFACE" | awk '{print $3}' | cut -d/ -f1 | head -1
    return
  fi
  ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}'
}

read_node_id() {
  if [[ -f "$NODE_ID_FILE" ]]; then
    tr -d ' \n' <"$NODE_ID_FILE"
    return
  fi
  echo ""
}

# Map cluster.json functional_role + agent_role to docker service set
services_for_role() {
  case "${1,,}" in
    vision) echo "vision-engine" ;;
    archive) echo "archive-node" ;;
    ai_matcher|ai-matcher|matcher) echo "command-center" ;;
    *) echo "" ;;
  esac
}

normalize_want() {
  # jq extracts slot matching our IP or Node XX label
  local ip="$1" nid="$2"
  python3 - "$CLUSTER_JSON" "$ip" "$nid" <<'PY'
import json, sys
path, ip, nid = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    doc = json.load(open(path))
except Exception:
    print("unknown")
    raise SystemExit(0)
want = "unknown"
label = f"Node {nid}".strip()
for s in doc.get("slots") or []:
    if str(s.get("ip_address", "")) == ip:
        want = str(s.get("agent_role") or s.get("functional_role") or "unknown")
        break
    if str(s.get("node_label", "")) == label:
        want = str(s.get("agent_role") or s.get("functional_role") or "unknown")
        break
# collapse functional labels to agent-style tokens
w = want.lower().replace(" ", "_")
if "vision" in w:
    print("vision")
elif "archive" in w:
    print("archive")
elif "matcher" in w or "ai" in w:
    print("ai_matcher")
else:
    print("unknown")
PY
}

apply_role() {
  local want="$1"
  [[ "$want" == "unknown" ]] && { log "desired role unknown — skip"; return 0; }
  local cur="unknown"
  [[ -f "$ROLE_FILE" ]] && cur=$(tr -d ' \n' <"$ROLE_FILE" | tr '[:upper:]' '[:lower:]')

  if [[ "$cur" == "$want" ]]; then
    return 0
  fi

  log "role change: $cur → $want (updating $ROLE_FILE)"
  install -d "$STATE"
  printf '%s\n' "$want" >"$ROLE_FILE"

  local svc
  svc=$(services_for_role "$want")
  if [[ -z "$svc" ]]; then
    log "no docker service mapped for $want"
    return 0
  fi

  if [[ ! -f "$REPO/docker-compose.yml" ]]; then
    log "missing $REPO/docker-compose.yml — set JUNCTION_REPO"
    return 1
  fi

  pushd "$REPO" >/dev/null
  log "docker compose stop (junction stack)"
  docker compose stop vision-engine archive-node command-center 2>/dev/null || true
  log "docker compose up -d $svc"
  docker compose up -d "$svc"
  popd >/dev/null
}

main() {
  install -d "$STATE"
  local ip nid want
  ip="$(primary_ip || true)"
  nid="$(read_node_id)"
  if [[ -z "$ip" || -z "$nid" ]]; then
    log "need primary IP and $NODE_ID_FILE"
    return 1
  fi

  if [[ ! -f "$CLUSTER_JSON" ]]; then
    log "no $CLUSTER_JSON yet — keeping role $([[ -f $ROLE_FILE ]] && cat $ROLE_FILE || echo unset)"
    return 0
  fi

  want="$(normalize_want "$ip" "$nid")"
  log "ip=$ip node_id=$nid desired_role=$want"
  apply_role "$want"
}

main "$@"
