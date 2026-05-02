//! Publishes dashboard-configured NDI output names by receiving existing LAN sources
//! (Vision switcher + `ndi-camera-bindings.json` map feeds → NDI names).

use axum::{routing::get, Json, Router};
use ndi::{Find, FrameType, RecvBuilder, SendBuilder};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[derive(Clone, Debug)]
enum Assignment {
    ProgramBus,
    Multiview { layout_id: String },
    Feed { feed_id: String },
    NdiCustom { ndi_name: String },
}

#[derive(Clone, Debug)]
struct ParsedSlot {
    id: String,
    enabled: bool,
    publish_name: String,
    assignment: Assignment,
}

#[derive(Clone, Default)]
struct SwitcherSnap {
    program_id: String,
    preview_id: String,
}

#[derive(Clone, Serialize)]
struct SlotHealth {
    id: String,
    enabled: bool,
    publish_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    multiview_note: Option<String>,
    input_query: String,
    resolved_ndi_name: Option<String>,
    ok: bool,
    detail: String,
}

#[derive(Serialize)]
struct HealthBody {
    status: &'static str,
    service: &'static str,
    vision_http: String,
    video_outputs_path: String,
    bindings_path: String,
    slots: Vec<SlotHealth>,
}

fn env_trim(key: &str, default: &str) -> String {
    std::env::var(key)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| default.to_string())
}

fn load_outputs(path: &Path) -> Vec<ParsedSlot> {
    let raw = match std::fs::read_to_string(path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("junction-output-router: cannot read {}: {e}", path.display());
            return Vec::new();
        }
    };
    let v: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("junction-output-router: invalid JSON in {}: {e}", path.display());
            return Vec::new();
        }
    };
    let Some(arr) = v.get("outputs").and_then(|x| x.as_array()) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for o in arr {
        let id = o.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let enabled = o.get("enabled").and_then(|x| x.as_bool()).unwrap_or(true);
        let ndi_stream_name = o
            .get("ndiStreamName")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let assignment_val = o.get("assignment").cloned().unwrap_or(Value::Null);
        let assignment = parse_assignment(&assignment_val);
        if id.is_empty() || ndi_stream_name.is_empty() {
            continue;
        }
        out.push(ParsedSlot {
            id,
            enabled,
            publish_name: ndi_stream_name,
            assignment,
        });
    }
    out
}

fn parse_assignment(v: &Value) -> Assignment {
    let kind = v.get("kind").and_then(|k| k.as_str()).unwrap_or("program_bus");
    match kind {
        "program_bus" => Assignment::ProgramBus,
        "multiview_layout" => {
            let layout_id = v
                .get("layoutId")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            Assignment::Multiview { layout_id }
        }
        "feed" => {
            let feed_id = v
                .get("feedId")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            Assignment::Feed { feed_id }
        }
        "ndi_custom" => {
            let ndi_name = v
                .get("ndiName")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            Assignment::NdiCustom { ndi_name }
        }
        _ => Assignment::ProgramBus,
    }
}

#[derive(Clone, Default)]
struct BindingsDoc {
    by_feed: HashMap<String, String>,
}

fn load_bindings(path: &Path) -> BindingsDoc {
    let raw = match std::fs::read_to_string(path) {
        Ok(r) => r,
        Err(_) => return BindingsDoc::default(),
    };
    let v: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return BindingsDoc::default(),
    };
    let mut by_feed = HashMap::new();
    if let Some(arr) = v.get("bindings").and_then(|x| x.as_array()) {
        for b in arr {
            let feed_id = b
                .get("feedId")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            let ndi = b
                .get("ndiSourceName")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if !feed_id.is_empty() {
                by_feed.insert(feed_id, ndi);
            }
        }
    }
    BindingsDoc { by_feed }
}

fn binding_ndi_for_feed(doc: &BindingsDoc, feed: &str) -> Result<String, String> {
    let name = doc
        .by_feed
        .get(feed)
        .cloned()
        .unwrap_or_default()
        .trim()
        .to_string();
    if name.is_empty() {
        Err(format!(
            "feed `{feed}` has no ndiSourceName in ndi-camera-bindings.json"
        ))
    } else {
        Ok(name)
    }
}

fn resolve_input_query(
    assignment: &Assignment,
    switcher: &SwitcherSnap,
    bindings: &BindingsDoc,
) -> Result<(String, Option<String>), String> {
    match assignment {
        Assignment::ProgramBus => {
            let q = binding_ndi_for_feed(bindings, &switcher.program_id)?;
            Ok((q, None))
        }
        Assignment::Multiview { .. } => {
            let q = binding_ndi_for_feed(bindings, &switcher.program_id)?;
            Ok((
                q,
                Some(
                    "Multiview tiles are not composed here; publishing program-bus passthrough. Use a hardware MV or future compositor for true splits.".into(),
                ),
            ))
        }
        Assignment::Feed { feed_id } => {
            let q = binding_ndi_for_feed(bindings, feed_id)?;
            Ok((q, None))
        }
        Assignment::NdiCustom { ndi_name } => {
            let q = ndi_name.trim().to_string();
            if q.is_empty() {
                Err("ndi_custom assignment has empty ndiName".into())
            } else {
                Ok((q, None))
            }
        }
    }
}

fn poll_switcher(base: &str) -> SwitcherSnap {
    let url = format!("{}/api/switcher", base.trim_end_matches('/'));
    let body: Value = match ureq::get(&url).call() {
        Ok(resp) => match resp.into_json() {
            Ok(j) => j,
            Err(_) => return SwitcherSnap::default(),
        },
        Err(_) => return SwitcherSnap::default(),
    };
    SwitcherSnap {
        program_id: body
            .get("programId")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
        preview_id: body
            .get("previewId")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
    }
}

fn match_source(sources: &[ndi::Source], query: &str) -> Option<ndi::Source> {
    let q = query.trim();
    if q.is_empty() {
        return None;
    }
    sources
        .iter()
        .find(|s| s.get_name() == q)
        .or_else(|| sources.iter().find(|s| s.get_name().contains(q)))
        .cloned()
}

fn update_slot(
    slots: &Arc<Mutex<Vec<SlotHealth>>>,
    id: &str,
    update: impl FnOnce(&mut SlotHealth),
) {
    let Ok(mut g) = slots.lock() else {
        return;
    };
    if let Some(s) = g.iter_mut().find(|x| x.id == id) {
        update(s);
    }
}

fn bridge_thread(
    slot: ParsedSlot,
    vision_base: String,
    bindings_path: PathBuf,
    slots_health: Arc<Mutex<Vec<SlotHealth>>>,
) {
    if !slot.enabled {
        return;
    }

    loop {
        let bindings = load_bindings(&bindings_path);
        let switcher = poll_switcher(&vision_base);
        let (input_query, mv_note) = match resolve_input_query(&slot.assignment, &switcher, &bindings)
        {
            Ok(x) => x,
            Err(e) => {
                update_slot(&slots_health, &slot.id, |s| {
                    s.input_query.clear();
                    s.resolved_ndi_name = None;
                    s.ok = false;
                    s.detail = e.clone();
                    s.multiview_note = None;
                });
                thread::sleep(Duration::from_secs(1));
                continue;
            }
        };

        update_slot(&slots_health, &slot.id, |s| {
            s.input_query = input_query.clone();
            s.multiview_note = mv_note.clone();
            s.detail = "locating source…".into();
            s.resolved_ndi_name = None;
        });

        let find = match Find::new() {
            Ok(f) => f,
            Err(e) => {
                update_slot(&slots_health, &slot.id, |s| {
                    s.ok = false;
                    s.detail = format!("NDI Find create failed: {e:?}");
                });
                thread::sleep(Duration::from_secs(2));
                continue;
            }
        };

        let sources = match find.current_sources(4000) {
            Ok(s) => s,
            Err(e) => {
                update_slot(&slots_health, &slot.id, |s| {
                    s.ok = false;
                    s.detail = format!("NDI discovery timeout: {e:?}");
                });
                thread::sleep(Duration::from_secs(1));
                continue;
            }
        };

        let Some(src) = match_source(&sources, &input_query) else {
            update_slot(&slots_health, &slot.id, |s| {
                s.ok = false;
                s.detail = format!("no NDI source matching `{input_query}`");
            });
            thread::sleep(Duration::from_secs(1));
            continue;
        };

        let resolved_name = src.get_name();
        update_slot(&slots_health, &slot.id, |s| {
            s.resolved_ndi_name = Some(resolved_name.clone());
            s.ok = true;
            s.detail = "streaming".into();
        });

        let mut recv = match RecvBuilder::new()
            .source_to_connect_to(src)
            .ndi_recv_name(format!("JCRouter-{}", slot.id))
            .build()
        {
            Ok(r) => r,
            Err(e) => {
                update_slot(&slots_health, &slot.id, |s| {
                    s.ok = false;
                    s.detail = format!("recv build failed: {e:?}");
                });
                thread::sleep(Duration::from_secs(1));
                continue;
            }
        };

        let send = match SendBuilder::new()
            .ndi_name(slot.publish_name.clone())
            .build()
        {
            Ok(s) => s,
            Err(e) => {
                update_slot(&slots_health, &slot.id, |s| {
                    s.ok = false;
                    s.detail = format!("send build failed: {e:?}");
                });
                thread::sleep(Duration::from_secs(1));
                continue;
            }
        };

        let mut anchored_query = input_query.clone();
        loop {
            let bindings = load_bindings(&bindings_path);
            let sw = poll_switcher(&vision_base);
            match resolve_input_query(&slot.assignment, &sw, &bindings) {
                Ok((needed, _)) => {
                    if needed != anchored_query {
                        break;
                    }
                }
                Err(_) => break,
            }

            let mut video = None;
            match recv.capture_video(&mut video, 67) {
                FrameType::Video => {
                    if let Some(ref v) = video {
                        send.send_video(v);
                    }
                }
                FrameType::ErrorFrame => break,
                _ => {}
            }
        }

        drop(send);
        recv.disconnect();
        thread::sleep(Duration::from_millis(200));
    }
}

#[tokio::main]
async fn main() {
    let vision_base = env_trim("JUNCTION_VISION_HTTP", "http://127.0.0.1:9000");
    let video_outputs_path =
        PathBuf::from(env_trim("JUNCTION_VIDEO_OUTPUTS_PATH", "data/video-outputs.json"));
    let bindings_path =
        PathBuf::from(env_trim("JUNCTION_NDI_BINDINGS_PATH", "data/ndi-camera-bindings.json"));

    let parsed = load_outputs(&video_outputs_path);
    if parsed.is_empty() {
        eprintln!(
            "junction-output-router: no outputs in {} — HTTP health only",
            video_outputs_path.display()
        );
    }

    let slots_health: Arc<Mutex<Vec<SlotHealth>>> = Arc::new(Mutex::new(
        parsed
            .iter()
            .map(|s| SlotHealth {
                id: s.id.clone(),
                enabled: s.enabled,
                publish_name: s.publish_name.clone(),
                multiview_note: None,
                input_query: String::new(),
                resolved_ndi_name: None,
                ok: false,
                detail: "starting".into(),
            })
            .collect(),
    ));

    let sl = slots_health.clone();
    let vb = vision_base.clone();
    let bp = bindings_path.clone();
    for slot in parsed {
        let sh = sl.clone();
        let vbc = vb.clone();
        let bpc = bp.clone();
        thread::spawn(move || bridge_thread(slot, vbc, bpc, sh));
    }

    let listen = env_trim("JUNCTION_OUTPUT_ROUTER_HTTP", "0.0.0.0:9020");
    let addr: SocketAddr = listen.parse().expect("JUNCTION_OUTPUT_ROUTER_HTTP must be host:port");

    let health_state = HealthState {
        vision_http: vision_base.clone(),
        video_outputs_path: video_outputs_path.display().to_string(),
        bindings_path: bindings_path.display().to_string(),
        slots: slots_health.clone(),
    };

    let app = Router::new().route(
        "/health",
        get(move || {
            let st = health_state.clone();
            async move { Json(st.snapshot()) }
        }),
    );

    println!(
        "junction-output-router listening on http://{addr}/health\n  vision={}\n  outputs={}\n  bindings={}",
        health_state.vision_http,
        health_state.video_outputs_path,
        health_state.bindings_path
    );

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind output-router HTTP");
    axum::serve(listener, app)
        .await
        .expect("output-router serve");
}

#[derive(Clone)]
struct HealthState {
    vision_http: String,
    video_outputs_path: String,
    bindings_path: String,
    slots: Arc<Mutex<Vec<SlotHealth>>>,
}

impl HealthState {
    fn snapshot(&self) -> HealthBody {
        let slots = self
            .slots
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default();
        let ok = slots.iter().all(|s| !s.enabled || s.ok);
        HealthBody {
            status: if ok { "ok" } else { "degraded" },
            service: "junction-output-router",
            vision_http: self.vision_http.clone(),
            video_outputs_path: self.video_outputs_path.clone(),
            bindings_path: self.bindings_path.clone(),
            slots,
        }
    }
}
