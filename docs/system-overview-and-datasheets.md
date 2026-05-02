# Junction Core OS — System overview & technical datasheets

This document is the **canonical technical overview** of the repository: roles of each subsystem, runtime ports, dependencies, dashboard surfaces, and operator data files. It complements **`README.md`** (quick start, philosophy) and **`docs/control-api-spec.md`** (API contract detail).

**Document version:** tracks repository contents as of the last substantive edit. **Software versions** (Next.js, Rust edition, crate pins) are taken from manifest files in-tree.

---

## 1. Purpose and scope

**Junction Core OS** is a **portable broadcast control stack**: a **Next.js dashboard** (control plane UI + JSON persistence) plus **Rust services** for **NDI discovery / switcher state**, optional **NDI output bridging**, **ISO recording**, and **node telemetry / commands**. It targets **OB flight cases** and **studio racks** built around **small ARM SBCs** (e.g. Orange Pi class), **10GbE-class LAN**, and optional **WAN/tunnel** remote access.

**In scope (this repo):** operator UI, HTTP APIs, file-backed configuration, WebSocket/SSE paths, and service source code.

**Out of scope:** facility-specific wiring diagrams, hardware BOMs, vendor camera manuals, and legal/compliance sign-off (referenced operationally via **`/on-air`** checklist only).

---

## 2. Deployment topology (logical)

```
┌─────────────────────────────────────────────────────────────────┐
│                        LAN (e.g. 10GbE class)                    │
│  ┌──────────────┐   ┌─────────────┐   ┌─────────────────────┐   │
│  │ NDI sources  │   │ Vision      │   │ ISO recorder agent   │   │
│  │ (cameras,    │──▶│ :9000 HTTP  │   │ :9011 HTTP           │   │
│  │  encoders)   │   │ + /ws       │   │ + FFmpeg             │   │
│  └──────────────┘   └──────┬──────┘   └──────────┬──────────┘   │
│                            │                     │              │
│                            │                     │              │
│  ┌─────────────────────────▼─────────────────────▼──────────┐  │
│  │ Next.js Dashboard (:3000 dev default / configurable)      │  │
│  │ Session RBAC · JSON under ui/dashboard/data · REST APIs      │  │
│  └─────────────────────────┬─────────────────────────────────┘  │
│                            │                                     │
│  ┌─────────────────────────▼─────────────────────────────────┐  │
│  │ Node agents (UDP + optional HTTP push/pull)                 │  │
│  └────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Optional: junction-output-router — NDI recv→send :9020       │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Warm standby:** mirror **`ui/dashboard/data/`** to a second dashboard host; keep **one** authoritative routing brain. See **`docs/runbook-standby.md`** and **`scripts/junction-standby-sync.sh`**.

---

## 3. Software bill of materials (in-repo)

| Component | Path | Language / runtime | Notes |
| :--- | :--- | :--- | :--- |
| **Production dashboard** | `ui/dashboard/` | **Node.js**, **Next.js 14.2.x**, **React 18.3.x**, **TypeScript 5.5.x** | Operator UI + REST routes under `/api/*`; CSS in `app/globals.css` (no Tailwind dependency). |
| **Vision service** | `services/vision/` | **Rust**, edition **2021**, **Axum 0.7**, **Tokio**, **serde** | NDI SDK **Find** (discovery); WebSocket switcher bus; HTTP health & switcher API. |
| **Output router** | `services/output-router/` | **Rust**, **ndi** crate **0.1.2**, **Axum**, **ureq** | Optional NDI recv→send bridge for dashboard-defined publish names. |
| **ISO recorder agent** | `services/iso-recorder/` | **Rust**, **Axum**, **Tokio** (+ **FFmpeg** at runtime) | HTTP control of record jobs; disk preflight via env. |
| **Node agent** | `os-core/node-agent/` | **Rust** | UDP heartbeat; pairs with dashboard metrics/commands HTTP endpoints. |
| **Protos** | `shared/proto/` | **Protobuf** | Shared definitions for cluster/remap paths (`junction.proto`). |
| **gRPC client deps (dashboard)** | `package.json` | **@grpc/grpc-js**, **@grpc/proto-loader** | Used where cluster/remap features call gRPC targets. |

**External runtime dependencies (not vendored):**

| Dependency | Used by | Requirement |
| :--- | :--- | :--- |
| **NDI SDK / redistributable** | Vision (discovery), Output router (recv/send) | Platform install; licensing per **Vizrt / NewTek** terms. |
| **FFmpeg** | ISO recorder | Must be on `PATH` for encode paths. |

---

## 4. Service datasheets

### 4.1 Vision (`services/vision`)

| Field | Value |
| :--- | :--- |
| **Role** | NDI source discovery (scan); **switcher control plane** (program/preview/t-bar over WebSocket); thermal UDP fan-out to WS clients. |
| **Default bind** | **`0.0.0.0:9000`** (TCP) |
| **Endpoints (HTTP)** | `GET /health` — includes NDI scan summary + optional **`sync`** block if **`JUNCTION_SYNC_STATUS_PATH`** points to JSON (`ptp_lock`, `detail`). |
| | `GET /ndi/snapshot` — one-shot discovery JSON for dashboard binding UI. |
| | `GET/PUT /api/switcher` — switcher state JSON. |
| **WebSocket** | `GET /ws` — pushes NDI source lists on interval + switcher updates + relayed UDP thermal JSON. |
| **UDP** | Thermal watchdog JSON (`thermal_alert` / `thermal_clear`) — port from **`JUNCTION_THERMAL_ALERT_UDP_PORT`** (default **47779**). |
| **Env** | **`DEV_MODE`** — simulated NDI sources when discovery empty. |
| **Build** | `cargo build` / `cargo run` in `services/vision` — requires **libndi** / NDI SDK linkage per platform. |

### 4.2 Output router (`services/output-router`)

| Field | Value |
| :--- | :--- |
| **Role** | Subscribe to NDI sources named via **`ndi-camera-bindings.json`** + Vision switcher; **publish** streams under names from **`video-outputs.json`**. |
| **Default bind** | **`JUNCTION_OUTPUT_ROUTER_HTTP`** default **`0.0.0.0:9020`** |
| **Endpoints** | `GET /health` — slot status, degraded if enabled slots not streaming. |
| **Env** | **`JUNCTION_VISION_HTTP`**, **`JUNCTION_VIDEO_OUTPUTS_PATH`**, **`JUNCTION_NDI_BINDINGS_PATH`** — paths often relative to dashboard `data/` when launched from `ui/dashboard`. |
| **Multiview assignment** | Documented **passthrough of program bus** until a true compositor exists. |

### 4.3 ISO recorder (`services/iso-recorder`)

| Field | Value |
| :--- | :--- |
| **Role** | Start/stop FFmpeg-backed recordings (demo / ProRes demo / custom profiles per implementation). |
| **Default bind** | **`0.0.0.0:9011`** — override with **`JUNCTION_ISO_BIND`**. |
| **Endpoints** | `GET /health` — sessions + free space hints; **`POST /record/start`**, **`POST /record/stop`**. |
| **Env (examples)** | **`JUNCTION_ISO_PATH_PREFIXES`** — output path allowlist; **`JUNCTION_ISO_MIN_FREE_MB`** — minimum free space before start. |

### 4.4 Node agent (`os-core/node-agent`)

| Field | Value |
| :--- | :--- |
| **Role** | UDP heartbeat to the dashboard cohort; optional polling of **`GET /api/node-commands`** and **`POST /api/node-metrics`** when configured. |
| **Execution** | **`JUNCTION_ENABLE_COMMAND_EXECUTION`** gates dangerous actions (e.g. systemd hooks) — default safe posture off until explicitly trusted. |

### 4.5 Dashboard (`ui/dashboard`)

| Field | Value |
| :--- | :--- |
| **Role** | Single operator web app: RBAC sessions, JSON-backed operator state, REST aggregation, SSE sample stream. |
| **Dev default** | `npm run dev` → Next dev server (port **3000** in scripts). |
| **Production** | `npm run build` then `npm run start` — use **`start:public`** / **`dev:public`** for **`0.0.0.0`** bind + tunnel scripts as in **`README.md`**. |
| **Auth** | Cookie **`junction_session`**; **`middleware.ts`** redirects unauthenticated users to **`/login`** (excludes `/api/auth/*`, `/api/setup`, `/setup`, static assets). |
| **Control plane docs** | **`docs/control-api-spec.md`**. |

---

## 5. Ports & protocols (quick reference)

| Port (typical) | Protocol | Service |
| :--- | :--- | :--- |
| **3000** | HTTP | Next.js dashboard (`dev` / `start` scripts in `package.json`). |
| **9000** | HTTP + WebSocket | Vision (`/health`, `/ndi/snapshot`, `/api/switcher`, `/ws`). |
| **9011** | HTTP | ISO recorder. |
| **9020** | HTTP | Output router `/health` (control plane only; NDI is separate). |
| **47779** | UDP | Vision thermal relay (configurable). |

**Dashboard → Vision** base URL: **`VISION_HTTP_URL`** env or **`data/server-config.json`** field **`visionHttpUrl`**.

---

## 6. Dashboard UI routes (App Router pages)

| Route | Purpose |
| :--- | :--- |
| `/` | Main switcher / production surface |
| `/login` | Authentication |
| `/setup` | First-time setup (exempt from auth middleware when applicable) |
| `/multiview` | Multiview monitoring UI |
| `/graphics` | Graphics desk (PVW/PGM, media library, `graphics-show.json`) |
| `/video-outputs` | Video output routing intent (`video-outputs.json`) |
| `/camera-control` | Camera control deck + NDI↔Ethernet bindings |
| `/recording-rack` | Recording / ISO rack UI |
| `/gpu-modules` | GPU inventory / policy |
| `/overlay-modules` | Overlay module inventory |
| `/server-control` | Cluster config, probes, remote policy |
| `/server-rack` | Rack-oriented server UI |
| `/readiness` | Automated go/no-go checks |
| `/on-air` | On-air checklist session |
| `/mcr` | MCR quality overview |
| `/noc` | NOC-oriented view |
| `/system-health` | System health surface |
| `/talkback` | Comms placeholder surface |
| `/fiber-link`, `/link-balancer` | Transport / WAN policy pages |
| `/backup`, `/users` | Backup bundle + user admin |

**Note:** Navigation may list routes that are optional or stubbed in a given deployment—verify each link in your build.

---

## 7. Dashboard REST API index (`/api/*`)

High-level groups (see **`docs/control-api-spec.md`** for semantics):

| Area | Example routes |
| :--- | :--- |
| **Auth / session** | `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, password-reset |
| **Server / site** | `/api/server/config`, `/api/server/health`, `/api/server/services`, `/api/server/observability` |
| **Vision proxy / failover** | `/api/vision/switcher`, `/api/vision/health`, `/api/vision/failover`, `/api/vision/ndi-snapshot` |
| **Routing / outputs** | `/api/video-outputs`, `/api/ndi-camera-bindings`, `/api/ndi-presets` |
| **Graphics** | `/api/graphics-show`, `/api/graphics-assets`, `/api/graphics-assets/upload` |
| **Recording** | `/api/recording-rack`, `/api/recording/sessions` |
| **Nodes** | `/api/node-metrics`, `/api/node-commands` |
| **Modules** | `/api/gpu-modules`, `/api/overlay-modules` |
| **Operations** | `/api/on-air`, `/api/readiness`, `/api/tally`, `/api/timecode`, `/api/mcr/quality`, `/api/alerts`, `/api/audit` |
| **Realtime** | `/api/realtime/events` (SSE) |
| **Cluster** | `/api/cluster-remap` |
| **Backup** | `/api/backups`, `/api/backups/restore` |

---

## 8. Operator data files (`ui/dashboard/data/`)

These JSON files are the **persistent control-plane state** for the dashboard (backup bundle includes most of them):

| File | Purpose |
| :--- | :--- |
| `server-config.json` | Vision URL override, standby URLs, remote access policy, operator profile mode |
| `server-services.json` | Logical service probes |
| `users.json` | Dashboard users (seed + edits per deployment) |
| `node-metrics.json` | Last telemetry from nodes |
| `node-commands.json` | Command queue / acks |
| `recording-rack.json` | Rack layout + recorder bases |
| `recording-sessions.json` | Session bookkeeping |
| `broadcast-profiles.json` | Broadcast profiles |
| `link-balancer.json` | WAN / link policy |
| `fiber-link.json` | Fiber link metadata |
| `on-air-checklist.json` | Checklist template |
| `on-air-session.json` | Live checklist session |
| `overlay-modules.json` | Graphics module inventory |
| `gpu-modules.json` | GPU module inventory |
| `video-outputs.json` | NDI output name / assignment intent |
| `ndi-camera-bindings.json` | Feed ↔ NDI name ↔ control IP |
| `ndi-routing-presets.json` | Routing presets |
| `graphics-show.json` | Graphics PVW/PGM + media slots |
| `graphics-assets.json` | Uploaded media library metadata |
| `hardware-activation.json` | Activation flags |
| `observability-events.json` | Recent observability events |

**Uploaded binaries** live under **`ui/dashboard/public/junction-graphics/`** (served as **`/junction-graphics/*`**); filenames are referenced by `graphics-assets.json`.

---

## 9. Security & roles (summary)

- **Session cookie** gates UI routes (`middleware.ts`).
- **Permissions** (`lib/security.ts`): e.g. `rack.view`, `rack.configure`, `switcher.control`, `camera.control`, `overlay.control`, server/network privileges for destructive actions.
- **Remote access:** CIDR allowlists + optional **`DASHBOARD_REMOTE_ACCESS_CODE`**; Cloudflare tunnel header trust via **`JUNCTION_TRUST_CLOUDFLARE_HEADERS`** (see **`.env.local.example`**).
- **Secrets:** passwords via env (`DASHBOARD_*_PASSWORD`, `DASHBOARD_SESSION_SECRET`, `JUNCTION_AGENT_KEY`, etc.) — never commit real values.

---

## 10. Supported host OS / hardware (operational, not guaranteed)

| Layer | Typical deployment |
| :--- | :--- |
| **Dashboard & Vision build hosts** | **Linux** (ARM64 or x86_64), **macOS** (dev). Windows possible with Rust + NDI toolchain effort. |
| **Edge nodes** | **Orange Pi–class SBCs**, rack PCs, or VMs — depends on your facility. |
| **Network** | **L2/L3 LAN**; **NDI** discovery assumes multicast/broadcast semantics suitable for NDI on the segment. |

---

## 11. Related documentation

| Document | Contents |
| :--- | :--- |
| **`README.md`** | Philosophy, quick start, env hints, repository layout |
| **`docs/control-api-spec.md`** | Control API contract |
| **`docs/runbook-standby.md`** | Warm standby / DR posture |
| **`docs/node-agent-gpu-heartbeat-schema.md`** | Optional GPU fields in node metrics |
| **`services/output-router/README.md`** | Output router env & behavior |
| **`services/vision`** | Source for HTTP/WS endpoints (authoritative when docs drift) |

---

## 12. Revision history (maintenance)

When you add a service, route, or data file:

1. Update **`README.md`** “implemented today” table if user-visible.
2. Append routes to **Section 6–8** here.
3. Extend **`docs/control-api-spec.md`** for contract-level detail.

This file is intended as the **single executive + engineering overview** for onboarding and integration partners.
