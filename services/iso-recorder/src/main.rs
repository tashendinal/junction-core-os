//! Junction **ISO recorder agent**: starts/stops **FFmpeg** processes for file-based ISO.
//! Profiles: `demo` (H.264 test pattern), `prores_demo` (ProRes HQ test pattern, `.mov`), `custom`.
//!
//! **Disk**: before record start, free space on the output volume must exceed **`JUNCTION_ISO_MIN_FREE_MB`** (default 1024).
//! **Security**: only writes under path prefixes from `JUNCTION_ISO_PATH_PREFIXES` (comma-separated).

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

struct RunningSession {
    child: Child,
    output_path: String,
    profile: String,
    started_at_unix: i64,
}

type Sessions = Arc<Mutex<HashMap<String, RunningSession>>>;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartBody {
    session_key: String,
    output_path: String,
    profile: Option<String>,
    custom_ffmpeg_args: Option<Vec<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionInfo {
    session_key: String,
    output_path: String,
    profile: String,
    started_at_unix: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VolumeFree {
    path: String,
    free_mb: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthBody {
    status: &'static str,
    service: &'static str,
    active_sessions: usize,
    path_prefixes: String,
    min_free_mb: u64,
    sessions: Vec<SessionInfo>,
    volume_free_mb: Vec<VolumeFree>,
}

fn allowed_prefixes() -> Vec<PathBuf> {
    std::env::var("JUNCTION_ISO_PATH_PREFIXES")
        .unwrap_or_else(|_| "/var/junction,/tmp,/mnt".to_string())
        .split(',')
        .map(|s| PathBuf::from(s.trim()))
        .filter(|p| !p.as_os_str().is_empty())
        .collect()
}

fn min_free_mb() -> u64 {
    std::env::var("JUNCTION_ISO_MIN_FREE_MB")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1024)
}

#[cfg(unix)]
fn free_megabytes_for_path(path: &Path) -> std::io::Result<u64> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    let c = CString::new(path.as_os_str().as_bytes()).map_err(|_| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "path contains NUL")
    })?;
    unsafe {
        let mut vfs: libc::statvfs = std::mem::zeroed();
        if libc::statvfs(c.as_ptr(), &mut vfs) != 0 {
            return Err(std::io::Error::last_os_error());
        }
        let avail = u128::from(vfs.f_bavail) * u128::from(vfs.f_frsize);
        Ok((avail / (1024 * 1024)) as u64)
    }
}

#[cfg(not(unix))]
fn free_megabytes_for_path(_path: &Path) -> std::io::Result<u64> {
    Ok(u64::MAX)
}

fn path_is_allowed(path: &Path) -> bool {
    if !path.is_absolute() {
        return false;
    }
    let norm = path.to_string_lossy().to_string();
    if norm.contains("..") {
        return false;
    }
    allowed_prefixes()
        .iter()
        .any(|prefix| path.starts_with(prefix))
}

async fn reap_exited(sessions: &Sessions) {
    let mut guard = sessions.lock().await;
    let keys: Vec<String> = guard.keys().cloned().collect();
    let mut remove = Vec::new();
    for k in keys {
        if let Some(sess) = guard.get_mut(&k) {
            match sess.child.try_wait() {
                Ok(Some(_)) => remove.push(k),
                Ok(None) => {}
                Err(_) => remove.push(k),
            }
        }
    }
    for k in remove {
        guard.remove(&k);
    }
}

fn volume_hints() -> Vec<VolumeFree> {
    let mut out = Vec::new();
    for prefix in allowed_prefixes() {
        match free_megabytes_for_path(&prefix) {
            Ok(free_mb) => out.push(VolumeFree {
                path: prefix.to_string_lossy().to_string(),
                free_mb,
            }),
            Err(_) => out.push(VolumeFree {
                path: prefix.to_string_lossy().to_string(),
                free_mb: 0,
            }),
        }
    }
    out
}

async fn health(State(sessions): State<Sessions>) -> impl IntoResponse {
    reap_exited(&sessions).await;
    let guard = sessions.lock().await;
    let list: Vec<SessionInfo> = guard
        .iter()
        .map(|(k, s)| SessionInfo {
            session_key: k.clone(),
            output_path: s.output_path.clone(),
            profile: s.profile.clone(),
            started_at_unix: s.started_at_unix,
        })
        .collect();
    let n = list.len();
    Json(HealthBody {
        status: "ok",
        service: "junction-iso-recorder",
        active_sessions: n,
        path_prefixes: std::env::var("JUNCTION_ISO_PATH_PREFIXES")
            .unwrap_or_else(|_| "/var/junction,/tmp,/mnt".to_string()),
        min_free_mb: min_free_mb(),
        sessions: list,
        volume_free_mb: volume_hints(),
    })
}

async fn start_record(
    State(sessions): State<Sessions>,
    Json(body): Json<StartBody>,
) -> impl IntoResponse {
    reap_exited(&sessions).await;
    let key = body.session_key.trim().to_string();
    if key.is_empty() {
        return (StatusCode::BAD_REQUEST, "session_key required").into_response();
    }
    let out = PathBuf::from(body.output_path.trim());
    if !path_is_allowed(&out) {
        return (
            StatusCode::BAD_REQUEST,
            format!(
                "output_path not under allowed prefixes: {:?}",
                allowed_prefixes()
            ),
        )
            .into_response();
    }

    let threshold = min_free_mb();
    if let Some(parent) = out.parent() {
        let check_path = if parent.as_os_str().is_empty() {
            PathBuf::from("/")
        } else {
            parent.to_path_buf()
        };
        match free_megabytes_for_path(&check_path) {
            Ok(free) if free < threshold => {
                return (
                    StatusCode::BAD_REQUEST,
                    format!(
                        "insufficient free space on output volume: {free} MiB available, {threshold} MiB required (set JUNCTION_ISO_MIN_FREE_MB)"
                    ),
                )
                    .into_response();
            }
            Err(e) => {
                eprintln!("iso-recorder: could not statvfs {:?}: {e}", check_path);
            }
            _ => {}
        }
    }

    if let Some(parent) = out.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }

    if let Some(mut prev) = sessions.lock().await.remove(&key) {
        let _ = prev.child.kill().await;
    }

    let profile = body.profile.as_deref().unwrap_or("demo");
    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y");
    match profile {
        "demo" => {
            cmd.args([
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=1920x1080:rate=24",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=channel_layout=stereo:sample_rate=48000",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-preset",
                "veryfast",
                "-crf",
                "23",
                "-c:a",
                "aac",
                "-movflags",
                "+faststart",
            ]);
        }
        "prores_demo" => {
            cmd.args([
                "-f",
                "lavfi",
                "-i",
                "testsrc=size=1920x1080:rate=24",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=channel_layout=stereo:sample_rate=48000",
                "-c:v",
                "prores_ks",
                "-profile:v",
                "3",
                "-pix_fmt",
                "yuv422p10le",
                "-c:a",
                "pcm_s16le",
            ]);
        }
        "custom" => {
            let extra = body.custom_ffmpeg_args.unwrap_or_default();
            if extra.is_empty() {
                return (
                    StatusCode::BAD_REQUEST,
                    "custom profile requires custom_ffmpeg_args",
                )
                    .into_response();
            }
            for a in extra {
                cmd.arg(a);
            }
        }
        _ => {
            return (StatusCode::BAD_REQUEST, "unknown profile").into_response();
        }
    }
    cmd.arg(out.as_os_str());
    cmd.stdin(Stdio::null());
    cmd.stdout(Stdio::null());
    cmd.stderr(Stdio::null());
    cmd.kill_on_drop(true);

    let child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("ffmpeg spawn failed: {e}"),
            )
                .into_response();
        }
    };

    let started_at_unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    sessions.lock().await.insert(
        key.clone(),
        RunningSession {
            child,
            output_path: out.to_string_lossy().to_string(),
            profile: profile.to_string(),
            started_at_unix,
        },
    );

    Json(serde_json::json!({
        "ok": true,
        "sessionKey": key,
        "outputPath": out,
        "profile": profile,
    }))
    .into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StopBody {
    session_key: String,
}

async fn stop_record(State(sessions): State<Sessions>, Json(body): Json<StopBody>) -> impl IntoResponse {
    reap_exited(&sessions).await;
    let key = body.session_key.trim().to_string();
    if key.is_empty() {
        return (StatusCode::BAD_REQUEST, "session_key required").into_response();
    }
    match sessions.lock().await.remove(&key) {
        Some(mut sess) => {
            let _ = sess.child.kill().await;
            Json(serde_json::json!({ "ok": true, "sessionKey": key })).into_response()
        }
        None => (StatusCode::NOT_FOUND, "session not found").into_response(),
    }
}

#[tokio::main]
async fn main() {
    let sessions: Sessions = Arc::new(Mutex::new(HashMap::new()));
    let app = Router::new()
        .route("/health", get(health))
        .route("/record/start", post(start_record))
        .route("/record/stop", post(stop_record))
        .with_state(sessions.clone());

    let bind = std::env::var("JUNCTION_ISO_BIND").unwrap_or_else(|_| "0.0.0.0:9011".to_string());
    let listener = tokio::net::TcpListener::bind(&bind)
        .await
        .unwrap_or_else(|e| panic!("iso-recorder bind {bind}: {e}"));
    println!("Junction ISO recorder on http://{bind}  (GET /health, POST /record/start|stop)");
    axum::serve(listener, app).await.expect("iso-recorder serve");
}
