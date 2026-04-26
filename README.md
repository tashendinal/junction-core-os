# Junction Core OS 🎥 🚀

**Junction Core OS** is a high-performance, modular broadcast operating system engineered for the **Orange Pi 6 Ultra (CIX CD8180)**. It transforms a multi-node ARM cluster into a software-defined Outside Broadcast (OB) hub, specifically optimized for **1080p 24p** cinema and television production.

This project utilizes a distributed architecture to handle high-bitrate **NDI 6.0** ingest, real-time AI color matching, and precision synchronization across heterogeneous camera systems (Sony, Nikon, Canon, RED).

---

## 🛠 Prototype Architecture (3-Camera Setup)

The system operates on a 10GbE network backplane with zero-copy memory architecture to ensure ultra-low latency from lens to screen.

| Module | Node Role | Hardware | Primary Protocol |
| :--- | :--- | :--- | :--- |
| **01** | **Vision Engine** | Orange Pi 6 Ultra | NDI 6.0 Ingest (3x) + AI Matcher |
| **02** | **Archive Engine** | Orange Pi 6 Ultra | ISO Recording (Dual NVMe SSD) |
| **03** | **Command/Sync** | Orange Pi Board | PTP Grandmaster (IEEE 1588) |
| **04** | **Master Control** | MacBook Pro | DaVinci Resolve Live Grade Hub |
| **05** | **Rescue Node** | Orange Pi Zero 2W | OOB Management via SLT Fiber |

---

## ✨ Key Features

* **NDI 6.0 Ingest Pool:** Real-time 3-camera support (1x Sony A7 IV reference + 2x NDI sources) with auto-discovery and mDNS.
* **Universal AI Color Matcher:** NPU-accelerated (45 TOPS) histogram alignment to match Nikon/Canon/RED feeds to a Sony S-Log3/S-Cinetone reference.
* **MacBook/Resolve Bridge:** Live-grading of NDI feeds directly via DaVinci Resolve Studio using NDI Virtual Input over a Type-C 10GbE link.
* **Precision Timecode Sync:** Integrated PTP (Precision Time Protocol) to prevent frame drift across multiple camera manufacturers.
* **SLT-Fiber Fail-Safe:** Dedicated Out-of-Band (OOB) remote management allowing system resets via a private Tailscale VPN tunnel.
* **Production Dashboard:** Next.js-powered, high-contrast dark mode "Virtual ATEM" interface with real-time hardware telemetry (Temp/Fan/CPU).

---

## 🚀 Technical Stack

### **Core Infrastructure**
- **OS:** Minimal Debian 13 (Trixie) RootFS.
- **Kernel:** Linux 6.x + `PREEMPT_RT` (Real-Time) patches for deterministic frame timing.
- **Networking:** `systemd-networkd` with **LACP Bonding** (Mode 4) for dual 5GbE throughput.

### **Languages & Protocols**
- **Performance Layer:** **Rust** (NDI Routing & Video Processing).
- **System Logic:** **Go (Golang)** (gRPC Orchestration & Command).
- **Automation/AI:** **Python 3.12** (NPU/OpenCL AI Color Matching).
- **Frontend:** **Next.js**, **Tailwind CSS**, **Socket.io**.
- **Transport:** NDI|HX3, SRT (Cloud Bridge), MQTT (Telemetry), gRPC.

---

## 📂 Repository Structure

```text
junction-core-os/
├── .cursorrules           # AI Development & Coding Standards
├── os-core/               # Real-Time Kernel (PREEMPT_RT) & Build Scripts
├── services/              
│   ├── vision/            # NDI 6.0 Ingest, Switcher & AI Matcher
│   ├── archive/           # Multi-cam ISO Recording (FFmpeg/GStreamer)
│   ├── command/           # RCP (Sony SDK), PTP Master & Tally
│   └── rescue/            # OOB SLT-Fiber Rescue Node (Python/Flask)
├── ui/                    
│   ├── dashboard/         # Next.js Production Dashboard
│   └── bridge/            # DaVinci Resolve API & LUT Sync
└── shared/                # gRPC Protobufs & Heartbeat Logic
