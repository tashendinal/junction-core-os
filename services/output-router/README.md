# Junction output router

Rust service that **subscribes** to on-net NDI sources and **re-publishes** them under names from `ui/dashboard/data/video-outputs.json`, using:

- Vision **`GET /api/switcher`** — program/preview feed ids (`cam1` … `cam3`)
- **`data/ndi-camera-bindings.json`** — maps each `feedId` → `ndiSourceName` (what appears in NDI discovery)

Operators subscribe in **NDI Video Monitor** (or downstream gear) to **`ndiStreamName`** values such as `JUNCTION-PGM` and `JUNCTION-MV`.

## Behavior

| Assignment | Input source |
| :--- | :--- |
| `program_bus` | NDI name bound to **current program** feed |
| `feed` | NDI name bound to that **feed** |
| `ndi_custom` | Raw NDI name string |
| `multiview_layout` | **Passthrough of program bus** until a compositor exists (true multi-tile MV needs GPU/hardware or a future compose step) |

## Build / run

Requires the **NDI SDK** / runtime on the machine (same as `services/vision`).

```bash
cd services/output-router
cargo build --release
```

Run from the **dashboard app root** so default paths resolve (`ui/dashboard` when developing):

```bash
cd ui/dashboard
JUNCTION_VISION_HTTP=http://127.0.0.1:9000 \
JUNCTION_VIDEO_OUTPUTS_PATH=data/video-outputs.json \
JUNCTION_NDI_BINDINGS_PATH=data/ndi-camera-bindings.json \
../../services/output-router/target/release/junction-output-router
```

HTTP health (default **`http://0.0.0.0:9020/health`**):

```bash
curl -s http://127.0.0.1:9020/health | jq .
```

### Environment

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `JUNCTION_VISION_HTTP` | `http://127.0.0.1:9000` | Vision base URL |
| `JUNCTION_VIDEO_OUTPUTS_PATH` | `data/video-outputs.json` | Output slots + publish names |
| `JUNCTION_NDI_BINDINGS_PATH` | `data/ndi-camera-bindings.json` | Feed → NDI source name |
| `JUNCTION_OUTPUT_ROUTER_HTTP` | `0.0.0.0:9020` | Bind address for `/health` |

Set **`OUTPUT_ROUTER_HEALTH_URL=http://127.0.0.1:9020`** on the dashboard if you want **Readiness** to probe this service.

## Dashboard integration

- **Video outputs** page edits `video-outputs.json`
- **Camera control** → NDI bindings edits `ndi-camera-bindings.json`
- **Readiness** includes the router when `OUTPUT_ROUTER_HEALTH_URL` is set
- **GET `/api/tally`** exposes program/preview per feed (no NDI; HTTP only)
