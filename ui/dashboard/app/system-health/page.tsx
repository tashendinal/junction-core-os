"use client";

import { TopNav } from "../components/TopNav";
import React, { useEffect, useMemo, useState } from "react";

const STREAM_POINTS = 42;
const CORE_COUNT = 8;

export default function SystemHealthPage() {
  const [tbw] = useState(41.8);
  const [ssdTemp, setSsdTemp] = useState(47.2);
  const [iops, setIops] = useState(189_000);
  const [availableTb, setAvailableTb] = useState(6.2);
  const [recordBitrateMbps, setRecordBitrateMbps] = useState(480);

  const [droppedFrames, setDroppedFrames] = useState<number[]>(
    () => Array.from({ length: STREAM_POINTS }, () => 6 + Math.random() * 5)
  );
  const [latencyMs, setLatencyMs] = useState<number[]>(
    () => Array.from({ length: STREAM_POINTS }, () => 42 + Math.random() * 8)
  );
  const [encodingFps, setEncodingFps] = useState<number[]>(
    () => Array.from({ length: STREAM_POINTS }, () => 60 + Math.random() * 2)
  );

  const [coreClocks, setCoreClocks] = useState<number[]>(
    () => Array.from({ length: CORE_COUNT }, () => 2.1 + Math.random() * 0.7)
  );
  const [npuUtil, setNpuUtil] = useState(62);

  useEffect(() => {
    const timer = setInterval(() => {
      setSsdTemp((prev) => clamp(prev + (Math.random() - 0.5) * 0.8, 38, 71));
      setIops((prev) => Math.round(clamp(prev + (Math.random() - 0.5) * 14000, 60_000, 330_000)));
      setRecordBitrateMbps((prev) => Math.round(clamp(prev + (Math.random() - 0.5) * 16, 320, 700)));
      setAvailableTb((prev) => clamp(prev - Math.random() * 0.0025, 0.2, 8.0));

      setDroppedFrames((prev) => shift(prev, clamp(prev[prev.length - 1] + (Math.random() - 0.5) * 2, 0, 25)));
      setLatencyMs((prev) => shift(prev, clamp(prev[prev.length - 1] + (Math.random() - 0.5) * 2.2, 25, 95)));
      setEncodingFps((prev) => shift(prev, clamp(prev[prev.length - 1] + (Math.random() - 0.5) * 0.9, 56, 62)));

      setCoreClocks((prev) => prev.map((c) => clamp(c + (Math.random() - 0.5) * 0.15, 1.2, 2.9)));
      setNpuUtil((prev) => Math.round(clamp(prev + (Math.random() - 0.5) * 5, 20, 97)));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const timeRemaining = useMemo(() => {
    const bytesPerSecond = (recordBitrateMbps * 1_000_000) / 8;
    const totalSeconds = (availableTb * 1_000_000_000_000) / bytesPerSecond;
    return formatDuration(totalSeconds);
  }, [availableTb, recordBitrateMbps]);

  const droppedPath = linePath(droppedFrames, 360, 120, 25);
  const latencyPath = linePath(latencyMs, 360, 120, 100);
  const encodePath = linePath(encodingFps, 360, 120, 62);

  return (
    <main className="tactical-root">
      <TopNav />
      <section className="tactile-node diag-shell">
        <header className="diag-header">
          <h1 className="pane-title">System Health & Stream Diagnostics</h1>
          <p className="technical-label">NVMe / Streaming / Orange Pi 6 Ultra cluster telemetry</p>
        </header>

        <section className="diag-grid">
          <article className="diag-card">
            <h2 className="pane-title">SSD Health</h2>
            <div className="kv-list">
              <div><span>Drive</span><strong>NVMe RAID-A</strong></div>
              <div><span>Total Bytes Written</span><strong>{tbw.toFixed(1)} TBW</strong></div>
              <div><span>Temperature</span><strong>{ssdTemp.toFixed(1)} C</strong></div>
              <div><span>Real-time IOPS</span><strong>{iops.toLocaleString()} IOPS</strong></div>
            </div>
          </article>

          <article className="diag-card time-remaining-card">
            <h2 className="pane-title">Recording Status</h2>
            <p className="technical-label">Based on bitrate + available storage</p>
            <div className="time-remaining">{timeRemaining}</div>
            <div className="kv-list compact">
              <div><span>Bitrate</span><strong>{recordBitrateMbps} Mbps</strong></div>
              <div><span>Free Space</span><strong>{availableTb.toFixed(2)} TB</strong></div>
            </div>
          </article>

          <article className="diag-card wide">
            <h2 className="pane-title">Streaming Stats (RTMP / SRT)</h2>
            <div className="stream-graphs">
              <MetricGraph title="Dropped Frames" color="#ff5252" path={droppedPath} />
              <MetricGraph title="Latency (ms)" color="#00d4ff" path={latencyPath} />
              <MetricGraph title="Encoding Speed (fps)" color="#00ff41" path={encodePath} />
            </div>
          </article>

          <article className="diag-card wide">
            <h2 className="pane-title">Hardware Telemetry (Orange Pi 6 Ultra)</h2>
            <div className="cluster-grid">
              {coreClocks.map((clock, idx) => (
                <div key={`core-${idx}`} className="core-box">
                  <span className="technical-label">Core {idx + 1}</span>
                  <strong>{clock.toFixed(2)} GHz</strong>
                </div>
              ))}
            </div>
            <div className="npu-wrap">
              <span className="technical-label">NPU Utilization (45 TOPS)</span>
              <div className="meter-bar"><div style={{ width: `${npuUtil}%` }} /></div>
              <strong>{npuUtil}%</strong>
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}

function MetricGraph({ title, color, path }: { title: string; color: string; path: string }) {
  return (
    <div className="graph-card">
      <span className="technical-label">{title}</span>
      <svg viewBox="0 0 360 120" className="stream-line">
        <path d={path} style={{ stroke: color }} />
      </svg>
    </div>
  );
}

function shift(prev: number[], next: number) {
  return [...prev.slice(1), next];
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function linePath(points: number[], width: number, height: number, maxValue: number): string {
  const step = width / (points.length - 1);
  return points
    .map((point, index) => {
      const x = index * step;
      const y = height - (point / maxValue) * height;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  return `${days}d ${hours.toString().padStart(2, "0")}h ${mins.toString().padStart(2, "0")}m`;
}
