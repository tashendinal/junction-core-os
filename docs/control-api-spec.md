# Junction Core OS Control API Spec (v0.1)

This document defines a practical control contract between the Junction dashboard and Junction Core OS services.

Goal: one software-defined control surface for routing, recording, GPU/overlay modules, node orchestration, and operator policy.

## Design principles

- Dashboard is the control plane UI; services are modular runtime units.
- Every state-changing action should be API-driven, auditable, and permission-checked.
- Read paths should be cheap, cache-safe, and composable into readiness/MCR views.
- Real-time state fanout should use event streams (SSE and/or WS) instead of UI polling loops.
- Local CLI/systemd fallback remains available for disaster recovery when UI is unavailable.

## Control domains

- Routing / switcher: preview/program/t-bar and preset workflows.
- Node orchestration: service restarts and maintenance actions via node-agent queue.
- Recording control: primary/backup ISO lifecycle and health checks.
- GPU and overlay modules: inventory, policy assignment, readiness rollups.
- Security policy: remote access mode, CIDRs, operator profile mode, RBAC session checks.

## API surface (current + normalized targets)

### 1) Server configuration and operator profile

- `GET /api/server/config`
  - Returns site-level config (vision base, standby, remote policy, profile mode).
- `PUT /api/server/config`
  - Updates site-level config.
  - Must require maintenance/config permission and write audit + observability event.
- `GET /api/operator-profile`
  - Lightweight profile lookup for UI pages.
  - Returns:
    - `operatorProfileMode`: `single_vendor_operator | multi_vendor_software_defined`
    - `singleVendorProfile`: `sony_stack | blackmagic_style | custom | null`

### 2) Health and readiness

- `GET /api/server/health`
  - Aggregated status for vision, nodes, commands, services, GPU summary, observability sample.
- `GET /api/readiness`
  - Go/no-go checks with optional skip flags for specific domains (including optional **`OUTPUT_ROUTER_HEALTH_URL`** NDI bridge probe).
- `GET /api/tally`
  - Program/preview tally map for `cam1`–`cam3` from Vision switcher (bridge for GPIO / multiview labels).
- `GET /api/graphics-show` · `PUT /api/graphics-show` · `POST /api/graphics-show`
  - Dashboard-native graphics desk state (`preview` / `program` buses, layers, crawl/lines, **`media`**: background/overlay/logo asset ids + external URLs). Render modules poll **GET** (requires session); **PUT** saves; **POST** actions `take`, `cut`, `clear_preview`, `clear_program`, `copy_program_to_preview`.
- `GET /api/graphics-assets` · `DELETE /api/graphics-assets?id=…` · `POST /api/graphics-assets/upload` (multipart `file`)
  - Upload/list PNG/JPEG/WebP/GIF/MP4/WebM/MOV into `public/junction-graphics/`; metadata in `data/graphics-assets.json`.
- `GET /api/mcr/quality`
  - Supervisory quality model for MCR workflows (latency-tolerant monitoring).

### 3) Service probe and orchestration

- `GET /api/server/services`
  - Returns logical services and last probe results.
- `POST /api/server/services`
  - `action=probe | probe_all | orchestrate`
  - `orchestrate` queues node-agent command to restart/repair logical service.

### 4) Node telemetry and command queue

- `POST /api/node-metrics`
  - Node agents push metrics and optional GPU inventory heartbeat.
- `GET /api/node-commands?agent=1`
  - Agents poll pending commands.
- `PATCH /api/node-commands`
  - Agents ack command execution results.

### 5) Recording rack control

- `GET /api/recording/sessions`
  - Returns active/known recording session rows and recorder-agent health rollup.
- `POST /api/recording/sessions`
  - `action=start | stop` per module/tier.
  - Must run preflight checks and return structured error details.

### 6) GPU and overlay modules

- `GET/PUT/POST /api/gpu-modules`
  - CRUD/policy + discovery sync operations.
- `GET/PUT/POST /api/overlay-modules`
  - CRUD/policy + module status operations.

### 7) Realtime control-plane events

- `GET /api/realtime/events` (SSE)
  - Broadcasts observability/control-plane events for multi-dashboard synchronization.

## Standard response shape (recommended)

For new routes, use a consistent envelope:

- Success:
  - `{ "ok": true, "data": <payload>, "generatedAt": "<iso8601>" }`
- Error:
  - `{ "ok": false, "error": { "code": "<machine_code>", "message": "<human_message>" } }`

Benefits: predictable client behavior, easier operator messaging, better automation.

## Permission model (recommended mapping)

- Read-only operational views: `rack.view`
- Config mutations: `rack.configure`
- Live/maintenance actions: `server.maintenance` (+ domain-specific controls)
- Camera/audio/switcher/overlay actions: domain permissions (`camera.control`, etc.)

Every mutation route should:

- validate session and permission,
- write audit log entry,
- emit observability event.

## Event model (recommended)

Event object shape:

- `type`: machine event key (`server.config.update`, `recording.start`, etc.)
- `at`: ISO timestamp
- `source`: service/page/api origin
- `severity`: `info | warn | error`
- `detail`: JSON payload
- `correlationId`: optional request/action correlation key

Use this for:

- timeline in `/server-control`,
- sync via `/api/realtime/events`,
- MCR quality context.

## Module lifecycle contract (recommended)

For GPU/overlay/recording modules:

- `discovered`: detected via telemetry or registration
- `configured`: accepted into policy by operator
- `ready`: health checks passing
- `degraded`: partially available
- `offline`: unreachable

Common fields:

- `moduleId`, `kind`, `nodeId`, `state`, `lastSeenAt`, `health`, `version`, `capabilities`

## Reliability and failure behavior

- Time-box probe and control actions with explicit timeout defaults.
- Return actionable error codes (`agent_unreachable`, `preflight_failed`, `permission_denied`).
- Keep idempotent `PUT` for config and explicit action verbs for control `POST`.
- Prefer soft-fail rollups (degraded summaries) over hard-fail whole-page responses.

## Versioning strategy

- Prefix future incompatible APIs under `/api/v2/...`.
- Keep backward compatibility for dashboard minor versions where possible.
- Add changelog entries for route/field additions and deprecations.

## Next implementation step

Implement a typed shared client/contract layer in `ui/dashboard/lib/`:

- request helpers with envelope decoding,
- shared API types for config/health/modules/events,
- centralized error code mapping for operator-friendly UI messages.
