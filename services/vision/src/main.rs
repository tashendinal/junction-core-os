use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::{get, put},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use rand::seq::SliceRandom;
use serde::Serialize;
use serde_json::{json, Value};
use std::ffi::{c_char, c_uint, c_void, CStr};
use std::net::SocketAddr;
use std::ptr;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::net::UdpSocket;
use tokio::sync::broadcast;
use tokio::time::Duration;

#[repr(C)]
struct NdiSource {
    p_ndi_name: *const c_char,
    p_url_address: *const c_char,
}

#[link(name = "ndi")]
extern "C" {
    fn NDIlib_initialize() -> bool;
    fn NDIlib_destroy();
    fn NDIlib_find_create_v2(p_create_settings: *const c_void) -> *mut c_void;
    fn NDIlib_find_destroy(p_instance: *mut c_void);
    fn NDIlib_find_wait_for_sources(p_instance: *mut c_void, timeout_in_ms: c_uint) -> bool;
    fn NDIlib_find_get_current_sources(
        p_instance: *mut c_void,
        p_no_sources: *mut c_uint,
    ) -> *const NdiSource;
}

#[derive(Debug, Clone, Serialize)]
struct NdiSourceDto {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    url_address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
struct SwitcherState {
    program_id: String,
    preview_id: String,
    /// 0.0 — 1.0 mix position (preview → program).
    tbar: f64,
    revision: u64,
}

#[derive(Clone)]
struct AppState {
    dev_mode: bool,
    latency_buffer: u32,
    switcher: Arc<Mutex<SwitcherState>>,
    switcher_tx: broadcast::Sender<String>,
    /// Last NDI discovery scan time (unix ms) and source count from that scan.
    ndi_scan: Arc<Mutex<(Option<u64>, usize)>>,
}

const NDI_SCAN_INTERVAL_SEC: u64 = 5;

fn optional_cstr(ptr: *const c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    unsafe {
        let s = CStr::from_ptr(ptr).to_string_lossy().into_owned();
        if s.is_empty() {
            None
        } else {
            Some(s)
        }
    }
}

fn discover_cameras(_latency_buffer: u32) -> Vec<NdiSourceDto> {
    let mut cameras = Vec::new();

    unsafe {
        if !NDIlib_initialize() {
            eprintln!("Failed to initialize NDI SDK");
            return cameras;
        }

        let finder = NDIlib_find_create_v2(ptr::null());
        if finder.is_null() {
            eprintln!("Failed to create NDI finder");
            NDIlib_destroy();
            return cameras;
        }

        let _ = NDIlib_find_wait_for_sources(finder, 3_000);

        let mut source_count: c_uint = 0;
        let sources = NDIlib_find_get_current_sources(finder, &mut source_count);

        if !sources.is_null() {
            for idx in 0..source_count as usize {
                let source = sources.add(idx);
                let source_name_ptr = (*source).p_ndi_name;

                if !source_name_ptr.is_null() {
                    let source_name = CStr::from_ptr(source_name_ptr)
                        .to_string_lossy()
                        .into_owned();
                    let url_address = optional_cstr((*source).p_url_address);
                    cameras.push(NdiSourceDto {
                        name: source_name,
                        url_address,
                    });
                }
            }
        }

        NDIlib_find_destroy(finder);
        NDIlib_destroy();
    }

    cameras
}

fn switcher_payload(state: &SwitcherState) -> String {
    json!({
        "type": "switcher",
        "programId": state.program_id,
        "previewId": state.preview_id,
        "tbar": state.tbar,
        "revision": state.revision,
    })
    .to_string()
}

fn apply_switcher_message(
    state: &Mutex<SwitcherState>,
    body: &Value,
    switcher_tx: &broadcast::Sender<String>,
) {
    let mut s = state.lock().expect("switcher lock");
    if let Some(p) = body.get("programId").and_then(|x| x.as_str()) {
        s.program_id = p.to_string();
    }
    if let Some(p) = body.get("previewId").and_then(|x| x.as_str()) {
        s.preview_id = p.to_string();
    }
    if let Some(t) = body.get("tbar").and_then(|x| x.as_f64()) {
        s.tbar = t.clamp(0.0, 1.0);
    }
    s.revision = s.revision.saturating_add(1);
    let payload = switcher_payload(&s);
    drop(s);
    let _ = switcher_tx.send(payload);
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    dev_mode: bool,
    ndi: NdiHealthSection,
    sync: SyncHealthSection,
}

#[derive(Serialize)]
struct NdiHealthSection {
    last_scan_unix_ms: Option<u64>,
    last_source_count: usize,
    scan_interval_sec: u64,
    sdk: &'static str,
}

#[derive(Serialize)]
struct SyncHealthSection {
    ptp_lock: String,
    detail: String,
}

fn sync_health_from_env_file() -> SyncHealthSection {
    let default_detail =
        "Optional JSON via JUNCTION_SYNC_STATUS_PATH (keys: ptp_lock, detail) from ptp4l/chrony exporter.";
    match std::env::var("JUNCTION_SYNC_STATUS_PATH") {
        Ok(path) if !path.trim().is_empty() => {
            let path = path.trim();
            match std::fs::read_to_string(path) {
                Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                    Ok(v) => SyncHealthSection {
                        ptp_lock: v
                            .get("ptp_lock")
                            .and_then(|x| x.as_str())
                            .unwrap_or("unknown")
                            .to_string(),
                        detail: v
                            .get("detail")
                            .and_then(|x| x.as_str())
                            .unwrap_or("")
                            .to_string(),
                    },
                    Err(_) => SyncHealthSection {
                        ptp_lock: "parse_error".into(),
                        detail: format!("invalid JSON in JUNCTION_SYNC_STATUS_PATH ({path})"),
                    },
                },
                Err(e) => SyncHealthSection {
                    ptp_lock: "unknown".into(),
                    detail: format!("cannot read JUNCTION_SYNC_STATUS_PATH {path}: {e}"),
                },
            }
        }
        _ => SyncHealthSection {
            ptp_lock: "unknown".into(),
            detail: default_detail.into(),
        },
    }
}

/// HTTP snapshot of current NDI sources (for dashboard binding UI without opening WebSocket).
async fn ndi_snapshot_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let discovered = discover_cameras(state.latency_buffer);
    let scanned_ms = now_unix_ms();
    Json(json!({
        "sources": discovered,
        "scannedAtUnixMs": scanned_ms,
        "scanIntervalSec": NDI_SCAN_INTERVAL_SEC,
    }))
}

async fn health_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let (last_scan, count) = state.ndi_scan.lock().expect("ndi scan lock").clone();
    Json(HealthResponse {
        status: "ok",
        service: "junction-vision",
        dev_mode: state.dev_mode,
        ndi: NdiHealthSection {
            last_scan_unix_ms: last_scan,
            last_source_count: count,
            scan_interval_sec: NDI_SCAN_INTERVAL_SEC,
            sdk: "NDI Find (discovery)",
        },
        sync: sync_health_from_env_file(),
    })
}

async fn get_switcher_handler(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let s = state.switcher.lock().expect("switcher lock").clone();
    Json(json!({
        "type": "switcher",
        "programId": s.program_id,
        "previewId": s.preview_id,
        "tbar": s.tbar,
        "revision": s.revision,
    }))
}

async fn put_switcher_handler(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    apply_switcher_message(&state.switcher, &body, &state.switcher_tx);
    let s = state.switcher.lock().expect("switcher lock").clone();
    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "switcher": {
                "programId": s.program_id,
                "previewId": s.preview_id,
                "tbar": s.tbar,
                "revision": s.revision,
            }
        })),
    )
}

/// Forwards `thermal_alert` / `thermal_clear` JSON from the OS thermal watchdog (UDP) to all dashboards.
async fn thermal_alert_udp_listener(alert_tx: broadcast::Sender<String>) {
    let port: u16 = std::env::var("JUNCTION_THERMAL_ALERT_UDP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(47779);
    let bind = format!("0.0.0.0:{port}");
    let sock = match UdpSocket::bind(&bind).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Junction: thermal alert UDP bind on {bind} failed: {e}");
            return;
        }
    };
    println!("Junction: thermal alert UDP on {bind} → WebSocket clients");
    let mut buf = vec![0u8; 2048];
    loop {
        let Ok((n, _src)) = sock.recv_from(&mut buf).await else {
            continue;
        };
        if n == 0 {
            continue;
        }
        let Ok(text) = std::str::from_utf8(&buf[..n]) else {
            continue;
        };
        let text = text.trim();
        if let Ok(v) = serde_json::from_str::<Value>(text) {
            match v.get("type").and_then(|x| x.as_str()) {
                Some("thermal_alert") | Some("thermal_clear") => {
                    let _ = alert_tx.send(text.to_string());
                }
                _ => {}
            }
        }
    }
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let mut rx = state.switcher_tx.subscribe();
    let (mut sender, mut receiver) = socket.split();

    {
        let snap = state.switcher.lock().expect("switcher lock").clone();
        if sender
            .send(Message::Text(switcher_payload(&snap)))
            .await
            .is_err()
        {
            return;
        }
    }

    let mut ndi_tick = tokio::time::interval(Duration::from_secs(NDI_SCAN_INTERVAL_SEC));
    ndi_tick.tick().await;

    loop {
        tokio::select! {
            _ = ndi_tick.tick() => {
                let mut discovered = discover_cameras(state.latency_buffer);

                if discovered.is_empty() && state.dev_mode {
                    let simulated = ["Cam 1", "Cam 3"];
                    if let Some(choice) = simulated.choose(&mut rand::thread_rng()) {
                        discovered.push(NdiSourceDto {
                            name: (*choice).to_string(),
                            url_address: None,
                        });
                    }
                }

                let scanned_ms = now_unix_ms();
                {
                    let mut g = state.ndi_scan.lock().expect("ndi scan lock");
                    *g = (Some(scanned_ms), discovered.len());
                }

                let payload = json!({
                    "type": "ndi",
                    "sources": discovered,
                    "scannedAtUnixMs": scanned_ms,
                    "scanIntervalSec": NDI_SCAN_INTERVAL_SEC,
                }).to_string();
                if sender.send(Message::Text(payload)).await.is_err() {
                    break;
                }
            }
            incoming = receiver.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(v) = serde_json::from_str::<Value>(&text) {
                            let is_switcher = v.get("type").and_then(|t| t.as_str()) == Some("switcher")
                                || v.get("programId").is_some()
                                    && v.get("previewId").is_some();
                            if is_switcher {
                                apply_switcher_message(&state.switcher, &v, &state.switcher_tx);
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
            recv = rx.recv() => {
                match recv {
                    Ok(msg) => {
                        if sender.send(Message::Text(msg)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }
}

#[tokio::main]
async fn main() {
    let dev_mode = std::env::var("DEV_MODE")
        .map(|value| matches!(value.to_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false);

    let initial_switcher = SwitcherState {
        program_id: "cam2".to_string(),
        preview_id: "cam1".to_string(),
        tbar: 0.0,
        revision: 0,
    };

    let (switcher_tx, _rx) = broadcast::channel::<String>(512);

    let state = Arc::new(AppState {
        dev_mode,
        latency_buffer: 2,
        switcher: Arc::new(Mutex::new(initial_switcher)),
        switcher_tx: switcher_tx.clone(),
        ndi_scan: Arc::new(Mutex::new((None, 0))),
    });

    let udp_tx = switcher_tx.clone();
    tokio::spawn(async move {
        thermal_alert_udp_listener(udp_tx).await;
    });

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/ndi/snapshot", get(ndi_snapshot_handler))
        .route("/api/switcher", get(get_switcher_handler).put(put_switcher_handler))
        .route("/ws", get(ws_handler))
        .with_state(state.clone());

    let bind_addr: SocketAddr = "0.0.0.0:9000".parse().expect("valid bind address");
    println!(
        "Vision server on http://{}/health + http://{}/ndi/snapshot + ws://{}/ws (DEV_MODE={})",
        bind_addr, bind_addr, bind_addr, dev_mode
    );

    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .expect("failed to bind tcp listener");
    axum::serve(listener, app)
        .await
        .expect("vision server failed");
}
