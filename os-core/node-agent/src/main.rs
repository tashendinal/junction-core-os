//! Broadcasts a JSON UDP heartbeat every second for cluster discovery.
//! Also optionally pushes JSON metrics to dashboard API when endpoint env is set.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::net::{Ipv4Addr, SocketAddr, UdpSocket};
use std::path::Path;
use std::thread;
use std::time::Duration;

const DEFAULT_PORT: u16 = 47777;
const BROADCAST: Ipv4Addr = Ipv4Addr::BROADCAST;

#[derive(Serialize, Clone)]
struct Heartbeat<'a> {
    node_id: &'a str,
    ip: &'a str,
    thermal: &'a str,
    role: &'a str,
    hw_id: &'a str,
    cpu_pct: f32,
    memory_pct: f32,
    disk_pct: f32,
    network_rx_mbps: f32,
    network_tx_mbps: f32,
}

#[derive(Deserialize)]
struct PolledCommand {
    id: String,
    action: String,
}

#[derive(Deserialize)]
struct PollResponse {
    command: Option<PolledCommand>,
}

fn read_trim(path: &str, default: &str) -> String {
    fs::read_to_string(path)
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| default.to_string())
}

fn node_id() -> String {
    read_trim("/etc/junction/node_id", "00")
}

fn node_role() -> String {
    read_trim("/etc/junction/node_role", "unknown")
}

fn hw_id() -> String {
    if Path::new("/etc/junction/hw_id").exists() {
        return read_trim("/etc/junction/hw_id", "");
    }
    read_trim("/etc/machine-id", "unknown")
        .chars()
        .take(12)
        .collect()
}

fn thermal_string() -> String {
    // Linux thermal zone (millidegree C)
    if let Ok(temp) = fs::read_to_string("/sys/class/thermal/thermal_zone0/temp") {
        if let Ok(milli) = temp.trim().parse::<i64>() {
            let c = milli / 1000;
            return format!("{c}C");
        }
    }
    // vcgencmd on Raspberry Pi
    if let Ok(out) = std::process::Command::new("vcgencmd")
        .arg("measure_temp")
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout);
        if let Some(part) = s.split('=').nth(1) {
            let t = part.trim().trim_end_matches("'C");
            if !t.is_empty() {
                return format!("{t}C");
            }
        }
    }
    "n/a".to_string()
}

fn cpu_pct() -> f32 {
    let out = std::process::Command::new("sh")
        .arg("-lc")
        .arg("top -bn1 | awk '/Cpu\\(s\\)/ {print 100-$8}'")
        .output();
    if let Ok(o) = out {
        let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
        if let Ok(v) = s.parse::<f32>() {
            return v.clamp(0.0, 100.0);
        }
    }
    0.0
}

fn memory_pct() -> f32 {
    if let Ok(mem) = fs::read_to_string("/proc/meminfo") {
        let mut total = 0.0_f32;
        let mut avail = 0.0_f32;
        for line in mem.lines() {
            if line.starts_with("MemTotal:") {
                total = line.split_whitespace().nth(1).unwrap_or("0").parse::<f32>().unwrap_or(0.0);
            }
            if line.starts_with("MemAvailable:") {
                avail = line.split_whitespace().nth(1).unwrap_or("0").parse::<f32>().unwrap_or(0.0);
            }
        }
        if total > 0.0 {
            return ((total - avail) / total * 100.0).clamp(0.0, 100.0);
        }
    }
    0.0
}

fn disk_pct() -> f32 {
    let out = std::process::Command::new("sh")
        .arg("-lc")
        .arg("df -P / | awk 'NR==2 {gsub(\"%\",\"\",$5); print $5}'")
        .output();
    if let Ok(o) = out {
        let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
        if let Ok(v) = s.parse::<f32>() {
            return v.clamp(0.0, 100.0);
        }
    }
    0.0
}

fn push_http_metrics(hb: &Heartbeat, endpoint: &str, key: &str) {
    let payload = serde_json::json!({
        "nodeId": hb.node_id,
        "ip": hb.ip,
        "role": hb.role,
        "hwId": hb.hw_id,
        "thermalC": hb.thermal.trim_end_matches('C').parse::<f32>().unwrap_or(0.0),
        "cpuPct": hb.cpu_pct,
        "memoryPct": hb.memory_pct,
        "diskPct": hb.disk_pct,
        "networkRxMbps": hb.network_rx_mbps,
        "networkTxMbps": hb.network_tx_mbps
    });
    let _ = std::process::Command::new("curl")
        .args([
            "-sS",
            "-m",
            "2",
            "-X",
            "POST",
            endpoint,
            "-H",
            "Content-Type: application/json",
            "-H",
            &format!("x-junction-agent-key: {key}"),
            "--data",
            &payload.to_string(),
        ])
        .output();
}

fn poll_command(endpoint: &str, node_id: &str, key: &str) -> Option<PolledCommand> {
    let url = format!("{endpoint}?agent=1&nodeId={node_id}");
    let out = std::process::Command::new("curl")
        .args(["-sS", "-m", "2", &url, "-H", &format!("x-junction-agent-key: {key}")])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let parsed: PollResponse = serde_json::from_str(&text).ok()?;
    parsed.command
}

fn update_command_status(endpoint: &str, command_id: &str, status: &str, result: &str, key: &str) {
    let payload = serde_json::json!({
        "commandId": command_id,
        "status": status,
        "result": result
    });
    let _ = std::process::Command::new("curl")
        .args([
            "-sS",
            "-m",
            "2",
            "-X",
            "PATCH",
            endpoint,
            "-H",
            "Content-Type: application/json",
            "-H",
            &format!("x-junction-agent-key: {key}"),
            "--data",
            &payload.to_string(),
        ])
        .output();
}

fn run_node_action(action: &str, exec_enabled: bool) -> (bool, String) {
    if !exec_enabled {
        return (true, "Execution disabled by JUNCTION_ENABLE_COMMAND_EXECUTION=false".to_string());
    }

    let command = match action {
        "maintenance_on" => "mkdir -p /etc/junction && touch /etc/junction/maintenance_mode",
        "maintenance_off" => "rm -f /etc/junction/maintenance_mode",
        "restart_agent" => "systemctl restart junction-node-agent",
        "reboot" => "/sbin/reboot",
        "shutdown" => "/sbin/shutdown -h now",
        "restart_vision" => "systemctl try-restart junction-vision 2>/dev/null || systemctl try-restart vision 2>/dev/null || echo 'no systemd unit'",
        "start_vision" => "systemctl start junction-vision 2>/dev/null || systemctl start vision 2>/dev/null || echo 'no systemd unit'",
        "stop_vision" => "systemctl stop junction-vision 2>/dev/null || systemctl stop vision 2>/dev/null || echo 'no systemd unit'",
        _ => return (false, "Unsupported action".to_string()),
    };
    match std::process::Command::new("sh").arg("-lc").arg(command).output() {
        Ok(out) => {
            if out.status.success() {
                (true, format!("Executed: {action}"))
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                (false, format!("Command failed: {stderr}"))
            }
        }
        Err(e) => (false, format!("Execution error: {e}")),
    }
}

fn primary_ipv4(iface: Option<&str>) -> io::Result<String> {
    let addr_output = if let Some(ifname) = iface {
        std::process::Command::new("ip")
            .args(["-4", "addr", "show", "dev", ifname])
            .output()?
    } else {
        std::process::Command::new("ip")
            .args(["-4", "route", "get", "1.1.1.1"])
            .output()?
    };

    let text = String::from_utf8_lossy(&addr_output.stdout);
    for token in text.split_whitespace() {
        if token.contains('.') && token.matches('.').count() == 3 && !token.ends_with(':') {
            let ip = token.split('/').next().unwrap_or(token);
            if ip != "127.0.0.1" && !ip.starts_with("169.254.") {
                return Ok(ip.to_string());
            }
        }
    }
    Err(io::Error::new(
        io::ErrorKind::NotFound,
        "no suitable IPv4 address",
    ))
}

fn main() {
    let port: u16 = std::env::var("JUNCTION_HEARTBEAT_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    let iface = std::env::var("JUNCTION_BIND_IFACE").ok();
    let metrics_endpoint = std::env::var("JUNCTION_METRICS_ENDPOINT").ok();
    let command_endpoint = std::env::var("JUNCTION_COMMAND_ENDPOINT").ok();
    let metrics_key = std::env::var("JUNCTION_AGENT_KEY").unwrap_or_else(|_| "junction-agent-dev-key".to_string());
    let exec_enabled = std::env::var("JUNCTION_ENABLE_COMMAND_EXECUTION")
        .ok()
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let socket = match UdpSocket::bind("0.0.0.0:0") {
        Ok(s) => s,
        Err(e) => {
            eprintln!("junction-node-agent: bind failed: {e}");
            std::process::exit(1);
        }
    };
    if let Err(e) = socket.set_broadcast(true) {
        eprintln!("junction-node-agent: set_broadcast: {e}");
        std::process::exit(1);
    }

    let target = SocketAddr::new(BROADCAST.into(), port);

    loop {
        let ip = primary_ipv4(iface.as_deref()).unwrap_or_else(|_| "0.0.0.0".to_string());
        let nid = node_id();
        let role = node_role();
        let th = thermal_string();
        let hw = hw_id();
        let cpu = cpu_pct();
        let mem = memory_pct();
        let disk = disk_pct();
        let net_rx = 0.0_f32;
        let net_tx = 0.0_f32;

        let hb = Heartbeat {
            node_id: nid.as_str(),
            ip: ip.as_str(),
            thermal: th.as_str(),
            role: role.as_str(),
            hw_id: hw.as_str(),
            cpu_pct: cpu,
            memory_pct: mem,
            disk_pct: disk,
            network_rx_mbps: net_rx,
            network_tx_mbps: net_tx,
        };

        let json = serde_json::to_vec(&hb).unwrap_or_else(|_| b"{}".to_vec());
        let _ = socket.send_to(&json, target);
        if let Some(endpoint) = metrics_endpoint.as_deref() {
            push_http_metrics(&hb, endpoint, &metrics_key);
        }
        if let Some(endpoint) = command_endpoint.as_deref() {
            if let Some(cmd) = poll_command(endpoint, nid.as_str(), &metrics_key) {
                update_command_status(endpoint, cmd.id.as_str(), "acknowledged", "Command received", &metrics_key);
                let (ok, result) = run_node_action(cmd.action.as_str(), exec_enabled);
                update_command_status(
                    endpoint,
                    cmd.id.as_str(),
                    if ok { "completed" } else { "failed" },
                    result.as_str(),
                    &metrics_key,
                );
            }
        }

        thread::sleep(Duration::from_secs(1));
    }
}
