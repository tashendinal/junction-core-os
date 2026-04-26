use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use rand::seq::SliceRandom;
use serde_json::json;
use std::ffi::{c_char, c_uint, c_void, CStr};
use std::net::SocketAddr;
use std::ptr;
use std::sync::Arc;
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

#[derive(Clone)]
struct AppState {
    dev_mode: bool,
    latency_buffer: u32,
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

        // Wait briefly for network sources to appear via NDI discovery.
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

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| stream_sources(socket, state))
}

async fn stream_sources(mut socket: WebSocket, state: Arc<AppState>) {
    loop {
        let cameras = discover_cameras(state.latency_buffer);
        let mut sources: Vec<String> = cameras.into_iter().map(|cam| cam.source_name).collect();

        if sources.is_empty() && state.dev_mode {
            let simulated = ["Cam 1", "Cam 3"];
            if let Some(choice) = simulated.choose(&mut rand::thread_rng()) {
                sources.push((*choice).to_string());
            }
        }

        let payload = json!({ "sources": sources }).to_string();
        if socket.send(Message::Text(payload)).await.is_err() {
            break;
        }

        sleep(Duration::from_secs(5)).await;
    }
}

#[tokio::main]
async fn main() {
    let dev_mode = std::env::var("DEV_MODE")
        .map(|value| matches!(value.to_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false);

    let state = Arc::new(AppState {
        dev_mode,
        latency_buffer: 2,
    });

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .with_state(state.clone());

    let bind_addr: SocketAddr = "0.0.0.0:9000".parse().expect("valid bind address");
    println!(
        "Vision WebSocket server listening on ws://{}/ws (DEV_MODE={})",
        bind_addr, state.dev_mode
    );

    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .expect("failed to bind tcp listener");
    axum::serve(listener, app)
        .await
        .expect("vision websocket server failed");
}
