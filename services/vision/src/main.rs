use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::ffi::{c_char, c_uint, c_void, CStr};
use std::net::SocketAddr;
use std::ptr;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tokio::time::{sleep, Duration};

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

#[derive(Debug, Clone)]
struct CameraNode {
    source_name: String,
    latency_buffer: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
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
}

fn discover_cameras(latency_buffer: u32) -> Vec<CameraNode> {
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
                    cameras.push(CameraNode {
                        source_name,
                        latency_buffer,
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

fn apply_switcher_message(state: &Mutex<SwitcherState>, body: &Value, switcher_tx: &broadcast::Sender<String>) {
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

    let mut ndi_tick = tokio::time::interval(Duration::from_secs(5));
    ndi_tick.tick().await;

    loop {
        tokio::select! {
            _ = ndi_tick.tick() => {
                let mut sources: Vec<String> = discover_cameras(state.latency_buffer)
                    .into_iter()
                    .map(|cam| cam.source_name)
                    .collect();

                if sources.is_empty() && state.dev_mode {
                    let simulated = ["Cam 1", "Cam 3"];
                    if let Some(choice) = simulated.choose(&mut rand::thread_rng()) {
                        sources.push((*choice).to_string());
                    }
                }

                let payload = json!({ "type": "ndi", "sources": sources }).to_string();
                if sender.send(Message::Text(payload)).await.is_err() {
                    break;
                }
            }
            incoming = receiver.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(v) = serde_json::from_str::<Value>(&text) {
                            if v.get("type").and_then(|t| t.as_str()) == Some("switcher") {
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
        switcher_tx,
    });

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .with_state(state.clone());

    let bind_addr: SocketAddr = "0.0.0.0:9000".parse().expect("valid bind address");
    println!(
        "Vision WebSocket server listening on ws://{}/ws (DEV_MODE={})",
        bind_addr, dev_mode
    );

    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .expect("failed to bind tcp listener");
    axum::serve(listener, app)
        .await
        .expect("vision websocket server failed");
}
