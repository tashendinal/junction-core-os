# Junction Core OS

**Junction Core OS** is a **portable, modular broadcast control stack** built around a small **ARM cluster** (e.g. **Orange Pi 6 Ultra**) and a **10GbE-class LAN**. It is aimed at **outside broadcast (OB) flight cases** and can also run as a **fixed studio rack** or alongside **cloud** tooling for monitoring and backup—the same software paths apply; only networking, power, and redundancy patterns change.

**On-air readiness** is a combination of **this software**, **your hardware rehearsal**, and **operational process**. The repo includes an **On-Air** checklist and **server control** surfaces to support that bar; see [On-air readiness](#on-air-readiness) below.

---

## Documentation pack

| Document | Contents |
| :--- | :--- |
| **[System overview & technical datasheets](docs/system-overview-and-datasheets.md)** | **Full-stack reference:** services (Vision, ISO, node-agent, output-router), dashboard stack versions, default ports, UI/API indexes, `data/*.json` inventory, security summary, topology diagram |
| **[Control API spec](docs/control-api-spec.md)** | Dashboard ↔ services HTTP contract, permissions, patterns |
| **[Runbook: standby](docs/runbook-standby.md)** | Warm standby / mirrored control plane |
| **[Node agent GPU heartbeat schema](docs/node-agent-gpu-heartbeat-schema.md)** | Optional GPU fields in node metrics |

---

## What is implemented today (this repository)

| Area | Status |
| :--- | :--- |
| **Vision service** (`services/vision`, Rust) | **NDI SDK discovery** (Find), **WebSocket** bus (program / preview / T-bar), **REST** `GET /health` (optional **`JUNCTION_SYNC_STATUS_PATH`** JSON for PTP/sync hints), `GET/PUT /api/switcher`, **UDP** thermal alert forward |
| **Output router** (`services/output-router`, Rust) | **NDI recv → send** bridge: publishes dashboard **`video-outputs.json`** names (e.g. `JUNCTION-PGM`) using bindings + Vision switcher; **`GET /health`** on `:9020` |
| **Production dashboard** (`ui/dashboard`, Next.js) | **Switcher / multiview**, **NDI source** presence + **stale** hints, **routing presets**, **camera control** (VISCA/IP + model catalog + BM-style deck), **readiness**, **NOC**, **rack UI**, **recording rack** (HyperDeck-class slots + **ISO** primary/backup), **GPU modules** (plug-and-play multi-GPU, NVIDIA/L4 aware, Orange Pi control + GPU media policy), **graphics/overlay modules** (dedicated Orange Pi graphics plane), **server control** (probes, vision orchestration hooks, remote-access policy), **hardware activation**, **node metrics** & **command queue** |
| **Node agent** (`os-core/node-agent`, Rust) | **UDP heartbeat**, optional **HTTP metrics** push to dashboard, **command poll** (maintenance, reboot, **vision systemd** actions when execution enabled) |
| **ISO recorder agent** (`services/iso-recorder`, Rust + FFmpeg) | **HTTP** `GET /health` (active sessions + per-prefix **free space**), `POST /record/start` & `/record/stop`; **demo** (H.264), **prores_demo** (ProRes HQ test pattern, `.mov`), **custom**; **disk preflight** via **`JUNCTION_ISO_MIN_FREE_MB`**; path allowlist **`JUNCTION_ISO_PATH_PREFIXES`** |
| **NDI video decode / AI matcher / full archive plane** | **Partially** in-tree (ISO agent above); deeper **ProRes / house sync** parity is additional work. Dockerfiles exist under `services/` for future **archive-node** / **command-center** images. |

---

## Target architecture (roadmap)

The design goal remains a **multi-node OB hub**: NDI-class ingest, archive, PTP-grade sync, and grading bridges. The table below is the **intended** layout; wire-up continues in services beyond the vision binary.

| Module | Node role | Notes |
| :--- | :--- | :--- |
| **Vision** | Edge ingest / discovery | Discovery + switcher **control plane**; **NDI receive→publish** for routed outputs lives in **`output-router`** (not embedded in Vision) |
| **Archive / ISO** | Per-camera file ISO | **`iso-recorder`** on each record node; dashboard **`/recording-rack`** + JSON under `ui/dashboard/data/` |
| **Command / sync** | PTP, tally, RCP | Integrate with facility **grandmaster** and device protocols |
| **Control** | Mac / Resolve, etc. | NDI Virtual Input, live grade paths as you deploy |
| **Rescue** | OOB | Tailscale / fiber management patterns as you deploy |

---

## On-air readiness

Professional on-air operation expects **rehearsed failure recovery**, **monitoring**, and **documented checks**. In this repo:

- **`/on-air`** — Operator **checklist** (preflight → rehearsal → **live**), per-item sign-off, optional notes; state in `data/on-air-session.json` with template `data/on-air-checklist.json`.
- **`/server-control`** — **Cluster snapshot**, **service probes**, **vision restart** via node-agent queue, **site config** (`visionHttpUrl` + **warm standby** bookmarks/notes + **secure remote access policy** + **operator profile mode**: `single_vendor_operator` or `multi_vendor_software_defined`), **observability** events.
- **`/recording-rack`** — **Rack layout** for playback decks and **ISO channels** with **primary/backup** tiers; **`POST /api/recording/sessions`** drives remote **`iso-recorder`** agents (see Quick start).
- **`/gpu-modules`** — Optional plug-and-play GPU inventory / policy page for **single or multiple cards** (NVIDIA consumer/datacenter, L4-class cards, etc.) with Orange Pi + GPU workflow mapping.
- **`/overlay-modules`** — Dedicated graphics/overlay modules (Orange Pi-oriented) with output profile + engine state.
- **Realtime sync endpoint** — `GET /api/realtime/events` (SSE) for multi-dashboard event sync (switcher/camera/audio/graphics operators seeing shared state/events).
- **`/mcr`** — MCR monitoring + quality control page (`/api/mcr/quality`) for supervision and alerting without driving frame-accurate switching through cloud latency paths.
- **`/readiness`** — Automated **go / no-go** style signals (telemetry, thermal, storage, WAN profile, vision reachability, optional **NDI output router** when `OUTPUT_ROUTER_HEALTH_URL` is set, **ISO recorder HTTP**, optional **GPU modules**, optional **overlay modules**).
- **`GET /api/tally`** — Program / preview tally per `cam1`–`cam3` from Vision switcher (HTTP bridge for labels, GPIO glue, etc.).
- **Backups** — Dashboard backup bundle includes operator JSON (metrics, commands, server config, on-air state, **recording rack** + sessions, **gpu-modules**, **overlay-modules**, etc.).
- **Control API contract** — See **`docs/control-api-spec.md`** for the dashboard↔OS control-plane contract (config, health, orchestration, modules, realtime events, permissions).

**You still must** validate power, cooling, cabling, spares, and legal/audio compliance **on your hardware**—software cannot replace a physical rehearsal.

### Architecture (three planes + standby)

| Plane | Responsibility |
| :--- | :--- |
| **Control** | Routing, presets, operator UI, audit — Vision API/WS + dashboard |
| **Media / ISO / GPU** | FFmpeg record paths, disk, optional GPU acceleration — `iso-recorder` + `gpu-modules` policy |
| **Graphics / overlay** | Dedicated Orange Pi graphics modules + profile routing — `overlay-modules` |
| **Site / cluster** | JSON config, health, node commands, remote policy — `data/*.json`, server control |

**Warm standby:** mirror **`ui/dashboard/data/`** to a **second** dashboard host; keep **one** live control brain for routing. See **`docs/runbook-standby.md`** and **`scripts/junction-standby-sync.sh`**. **ISO** primary/backup tiers add **file** redundancy without requiring two full control stacks.

---

## Technical stack (as used in this repo)

| Layer | Technology |
| :--- | :--- |
| **Vision** | Rust, **Axum**, **Tokio**, **NDI SDK** (Find / discovery path) |
| **Output router** | Rust, **`ndi`** crate (recv/send), Axum `/health` |
| **Node agent** | Rust, UDP + optional `curl` for HTTP |
| **Dashboard** | **Next.js 14**, React 18, TypeScript; styling via **`app/globals.css`** (no Tailwind in `package.json`) |
| **Data plane** | JSON files under `ui/dashboard/data/` for operator state (metrics, commands, profiles, on-air, server config) |
| **Protocols** | **NDI** (discovery), **WebSocket**, **HTTP**; **VISCA over IP** for some camera paths; node **UDP** heartbeat |

---

## Repository layout

```text
junction-core-os/
├── os-core/                 # Node agent, remap helpers
├── services/
│   ├── vision/              # NDI discovery + switcher WS + HTTP API (implemented)
│   ├── output-router/       # NDI bridge → dashboard publish names (implemented)
│   ├── iso-recorder/        # FFmpeg-backed ISO agent on :9011 (implemented)
│   ├── archive-node/        # Dockerfile stub (future)
│   └── command-center/      # Dockerfile stub (future)
├── ui/
│   └── dashboard/           # Next.js production / control UI
├── shared/proto/            # junction.proto (shared definitions)
├── docs/
│   ├── runbook-standby.md   # Warm standby / carbon-copy control plane
│   ├── control-api-spec.md  # Dashboard <-> Junction Core OS control contract
│   └── node-agent-gpu-heartbeat-schema.md  # Optional GPU heartbeat fields for node metrics
├── scripts/
│   └── junction-standby-sync.sh  # rsync ui/dashboard/data from primary
└── README.md
```

---

## Quick start (development)

### Vision (Rust)

```bash
cd services/vision
# Requires NDI SDK / libndi on the host for full discovery
cargo run
# Listens on 0.0.0.0:9000 — WebSocket /ws, GET /health, PUT /api/switcher
```

### ISO recorder agent (Rust + FFmpeg)

```bash
cd services/iso-recorder
cargo run
# Listens on 0.0.0.0:9011 — GET /health, POST /record/start, POST /record/stop
# JUNCTION_ISO_BIND — bind address (default 0.0.0.0:9011)
# JUNCTION_ISO_PATH_PREFIXES — comma-separated allowlist for output paths
# JUNCTION_ISO_MIN_FREE_MB — minimum free MiB on output volume before start (default 1024)
```

Point **`primaryRecorderBase`** / **`backupRecorderBase`** in `ui/dashboard/data/recording-rack.json` at each node’s URL (e.g. `http://192.168.1.50:9011`). Use the dashboard **`[RECORD]`** tab to start/stop **ISO** tiers (playback deck rows are rack planning only until a deck agent exists).

### Dashboard (Next.js)

```bash
cd ui/dashboard
npm install
npm run dev
```

Use **`.env.local`** as needed, e.g. `VISION_HTTP_URL`, `JUNCTION_AGENT_KEY`, `DASHBOARD_*` passwords, `READINESS_SKIP_VISION=1`, `READINESS_SKIP_ISO=1`, `READINESS_SKIP_GPU=1`, `READINESS_SKIP_OVERLAY=1`, and `DASHBOARD_REMOTE_ACCESS_CODE` (when secure remote login mode + remote code is enabled).

### Node agent → dashboard

On each node, set **`JUNCTION_METRICS_ENDPOINT`** to the dashboard **`POST /api/node-metrics`** URL and **`JUNCTION_COMMAND_ENDPOINT`** to **`GET/PATCH /api/node-commands`**. Enable execution only when you trust the network: **`JUNCTION_ENABLE_COMMAND_EXECUTION=true`**.

---

## License / NDI

NDI is subject to **NewTek / Vizrt** SDK licensing. Build and ship the vision service only in compliance with their terms.

---

## Contributing

Match existing patterns: small focused diffs, server-side auth for dangerous routes, audit / observability for operator actions where appropriate.
