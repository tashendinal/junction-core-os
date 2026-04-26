"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type CameraFeed = {
  id: string;
  label: string;
  resolution: string;
  bitrate: number;
  histogram: number[];
  detected: boolean;
};

const FEEDS = [
  { id: "cam1", label: "CAM 1" },
  { id: "cam2", label: "CAM 2" },
  { id: "cam3", label: "CAM 3" },
];

const WS_URL = "ws://localhost:9000/ws";

type SwitcherPayload = {
  type: "switcher";
  programId: string;
  previewId: string;
  tbar: number;
  revision?: number;
};

export default function DashboardPage() {
  const [connected, setConnected] = useState(false);
  const [showMultiview, setShowMultiview] = useState(true);
  const [previewId, setPreviewId] = useState("cam1");
  const [programId, setProgramId] = useState("cam2");
  const [tbar01, setTbar01] = useState(0);
  const [transitionDuration, setTransitionDuration] = useState(800);
  const [bondWave, setBondWave] = useState<number[]>(() => Array.from({ length: 36 }, () => 40));
  const [nvmeWrite, setNvmeWrite] = useState(1280);
  const [temps, setTemps] = useState<number[]>([54, 62, 49, 72, 58, 67, 45, 61]);
  const [talk, setTalk] = useState<Record<string, boolean>>({ cam1: true, cam2: false, cam3: false });
  const [recordArmed, setRecordArmed] = useState(false);
  const [streamArmed, setStreamArmed] = useState(false);
  const [scopesByFeed, setScopesByFeed] = useState<Record<string, boolean>>({
    cam1: false,
    cam2: false,
    cam3: false,
  });
  const [timecode, setTimecode] = useState("00:00:00:00");
  const [sourceMap, setSourceMap] = useState<Set<string>>(new Set());
  const router = useRouter();
  const pathname = usePathname();

  const wsRef = useRef<WebSocket | null>(null);
  const previewRef = useRef(previewId);
  const programRef = useRef(programId);
  const tbarRef = useRef(tbar01);
  const autoFrameRef = useRef<number | null>(null);

  useEffect(() => {
    previewRef.current = previewId;
  }, [previewId]);
  useEffect(() => {
    programRef.current = programId;
  }, [programId]);
  useEffect(() => {
    tbarRef.current = tbar01;
  }, [tbar01]);

  const sendSwitcher = useCallback((patch: Partial<{ programId: string; previewId: string; tbar: number }>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const payload: SwitcherPayload = {
      type: "switcher",
      programId: patch.programId ?? programRef.current,
      previewId: patch.previewId ?? previewRef.current,
      tbar: patch.tbar ?? tbarRef.current,
    };
    ws.send(JSON.stringify(payload));
  }, []);

  const cancelAutoTransition = useCallback(() => {
    if (autoFrameRef.current != null) {
      cancelAnimationFrame(autoFrameRef.current);
      autoFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    wsRef.current = socket;
    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onerror = () => setConnected(false);
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as Record<string, unknown>;
        const msgType = typeof payload.type === "string" ? payload.type : undefined;
        const rawSources = payload.sources;
        const ndiSources =
          msgType === "ndi" && Array.isArray(rawSources)
            ? (rawSources as string[])
            : !msgType && Array.isArray(rawSources)
              ? (rawSources as string[])
              : null;
        if (ndiSources) {
          setSourceMap(new Set(ndiSources.map((item) => item.toLowerCase())));
          return;
        }
        if (msgType === "switcher") {
          const p = payload.programId;
          const w = payload.previewId;
          const tb = payload.tbar;
          if (typeof p === "string" && typeof w === "string" && typeof tb === "number") {
            setProgramId(p);
            setPreviewId(w);
            setTbar01(Math.min(1, Math.max(0, tb)));
          }
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimecode((prev) => nextTc(prev));
      setBondWave((prev) => [...prev.slice(1), Math.max(15, Math.min(98, 58 + (Math.random() - 0.5) * 36))]);
      setNvmeWrite((prev) => Math.max(320, Math.min(3300, prev + (Math.random() - 0.5) * 420)));
      setTemps((prev) => prev.map((t) => Math.max(38, Math.min(92, t + (Math.random() - 0.5) * 8))));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const runAutoTransition = useCallback(() => {
    cancelAutoTransition();
    const start = performance.now();
    const duration = Math.max(120, transitionDuration);
    const targetPreview = previewRef.current;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setTbar01(t);
      sendSwitcher({ tbar: t, previewId: targetPreview, programId: programRef.current });
      if (t >= 1) {
        autoFrameRef.current = null;
        setProgramId(targetPreview);
        setTbar01(0);
        sendSwitcher({ tbar: 0, programId: targetPreview, previewId: targetPreview });
        return;
      }
      autoFrameRef.current = requestAnimationFrame(tick);
    };
    autoFrameRef.current = requestAnimationFrame(tick);
  }, [cancelAutoTransition, sendSwitcher, transitionDuration]);

  const runCutTransition = useCallback(() => {
    cancelAutoTransition();
    const nextPgm = previewRef.current;
    setTbar01(1);
    sendSwitcher({ tbar: 1, programId: nextPgm, previewId: nextPgm });
    setProgramId(nextPgm);
    setTbar01(0);
    sendSwitcher({ tbar: 0, programId: nextPgm, previewId: nextPgm });
  }, [cancelAutoTransition, sendSwitcher]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (event.key === "1") {
        setPreviewId("cam1");
        sendSwitcher({ previewId: "cam1" });
      }
      if (event.key === "2") {
        setPreviewId("cam2");
        sendSwitcher({ previewId: "cam2" });
      }
      if (event.key === "3") {
        setPreviewId("cam3");
        sendSwitcher({ previewId: "cam3" });
      }
      if (event.key === " ") {
        event.preventDefault();
        runCutTransition();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        runAutoTransition();
      }
      if (key === "m") {
        setShowMultiview((prev) => !prev);
      }
      if (key === "r") {
        setRecordArmed((prev) => !prev);
      }
      if (key === "s") {
        setStreamArmed((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runAutoTransition, runCutTransition, sendSwitcher]);

  useEffect(() => () => cancelAutoTransition(), [cancelAutoTransition]);

  const cameraFeeds: CameraFeed[] = useMemo(
    () =>
      FEEDS.map((feed) => ({
        ...feed,
        resolution: "1080p59.94",
        bitrate: 90 + Math.round(Math.random() * 70),
        histogram: Array.from({ length: 20 }, () => Math.round(25 + Math.random() * 75)),
        detected: sourceMap.has(feed.label.toLowerCase()),
      })),
    [sourceMap, timecode]
  );

  const bondPath = linePath(bondWave, 260, 80);

  const onTbarInput = (value: number) => {
    cancelAutoTransition();
    const t = Math.min(1, Math.max(0, value));
    setTbar01(t);
    sendSwitcher({ tbar: t });
    if (t >= 1) {
      const next = previewRef.current;
      setProgramId(next);
      setTbar01(0);
      sendSwitcher({ tbar: 0, programId: next, previewId: next });
    }
  };

  return (
    <main className="tactical-root">
      <nav className="top-nav tactile-node">
        <div className="nav-logo-slot" aria-label="Junction Core logo slot">
          <span>JUNCTION CORE</span>
        </div>
        <div className="top-nav-tabs top-nav-tabs-four">
          <button
            className={`top-tab ${pathname === "/" ? "active" : ""}`}
            onClick={() => router.push("/")}
          >
            [SWITCHER]
          </button>
          <button
            className={`top-tab ${pathname === "/talkback" ? "active" : ""}`}
            onClick={() => router.push("/talkback")}
          >
            [COMMS]
          </button>
          <button
            className={`top-tab ${pathname === "/system-health" ? "active" : ""}`}
            onClick={() => router.push("/system-health")}
          >
            [STORAGE/STREAM]
          </button>
          <button
            className={`top-tab ${pathname === "/server-rack" ? "active" : ""}`}
            onClick={() => router.push("/server-rack")}
          >
            [RACK]
          </button>
        </div>
      </nav>
      <div className="grid-shell">
        <aside className="left-pane tactile-node">
          <h2 className="pane-title">Server & Network Matrix</h2>
          <section className="block">
            <p className="technical-label">Node Health</p>
            <div className="node-grid">
              {temps.map((temp, idx) => (
                <div
                  key={`node-${idx}`}
                  className={`node ${temp > 75 ? "hot pulse-hot" : temp > 68 ? "hot" : "cool"}`}
                >
                  <span>N{idx + 1}</span>
                  <small>{temp.toFixed(0)}C</small>
                </div>
              ))}
            </div>
          </section>
          <section className="block">
            <p className="technical-label">10Gbps LACP Bond Throughput</p>
            <svg viewBox="0 0 260 80" className="bond-wave">
              <path d={bondPath} />
            </svg>
          </section>
          <section className="block">
            <p className="technical-label">NVMe Write Speed</p>
            <div className="meter-wrap">
              <div className="meter-bar">
                <div style={{ width: `${Math.min(100, (nvmeWrite / 3500) * 100)}%` }} />
              </div>
              <strong>{nvmeWrite.toFixed(0)} MB/s</strong>
            </div>
          </section>
        </aside>

        <section className="center-pane">
          {showMultiview ? (
            <section className="multiview-pane tactile-node">
              <h2 className="pane-title">Master Multiview</h2>
              <div className="multiview-grid">
                {cameraFeeds.map((feed) => {
                  const tallyClass =
                    programId === feed.id ? "program" : previewId === feed.id ? "preview" : "standby";
                  return (
                    <article key={feed.id} className={`cam-tile ${tallyClass}`}>
                      <div className="cam-head">
                        <strong>{feed.label}</strong>
                        <span>{feed.detected ? "LIVE" : "STBY"}</span>
                      </div>
                      <div className="osd">
                        <div>NDI {feed.bitrate} Mbps</div>
                        <div>{feed.resolution}</div>
                        <div className="hist">
                          {feed.histogram.map((h, i) => (
                            <span key={`${feed.id}-h-${i}`} style={{ height: `${h}%` }} />
                          ))}
                        </div>
                      </div>
                      <button
                        className={`scopes-btn ${scopesByFeed[feed.id] ? "active" : ""}`}
                        onClick={() =>
                          setScopesByFeed((prev) => ({
                            ...prev,
                            [feed.id]: !prev[feed.id],
                          }))
                        }
                      >
                        Scopes
                      </button>
                      {scopesByFeed[feed.id] ? (
                        <div className="scopes-overlay">
                          <div className="scope-block">
                            <small>Hist</small>
                            <div className="scope-hist">
                              {feed.histogram.map((h, i) => (
                                <span key={`${feed.id}-scope-h-${i}`} style={{ height: `${Math.max(10, h)}%` }} />
                              ))}
                            </div>
                          </div>
                          <div className="scope-block">
                            <small>RGB</small>
                            <div className="rgb-parade">
                              {feed.histogram.slice(0, 8).map((h, i) => (
                                <span
                                  key={`${feed.id}-rgb-r-${i}`}
                                  className="r"
                                  style={{ height: `${Math.max(12, h)}%` }}
                                />
                              ))}
                              {feed.histogram.slice(8, 16).map((h, i) => (
                                <span
                                  key={`${feed.id}-rgb-g-${i}`}
                                  className="g"
                                  style={{ height: `${Math.max(12, h)}%` }}
                                />
                              ))}
                              {feed.histogram.slice(12, 20).map((h, i) => (
                                <span
                                  key={`${feed.id}-rgb-b-${i}`}
                                  className="b"
                                  style={{ height: `${Math.max(12, h)}%` }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="multiview-pane tactile-node multiview-off">
              <h2 className="pane-title">Master Multiview</h2>
              <p className="technical-label">Hidden (press M to restore)</p>
            </section>
          )}

          <section className="switch-pane tactile-node">
            <h2 className="pane-title">Switching Bus</h2>
            <div className="bus-layout">
              <div className="bus-left">
                <p className="technical-label">PGM</p>
                <div className="bus-row">
                  {FEEDS.map((feed) => (
                    <button
                      key={`pgm-${feed.id}`}
                      className={`bus-btn ${programId === feed.id ? "pgm-active" : ""}`}
                      onClick={() => {
                        cancelAutoTransition();
                        setProgramId(feed.id);
                        sendSwitcher({ programId: feed.id });
                      }}
                    >
                      {feed.label}
                    </button>
                  ))}
                </div>
                <p className="technical-label">PVW</p>
                <div className="bus-row">
                  {FEEDS.map((feed) => (
                    <button
                      key={`pvw-${feed.id}`}
                      className={`bus-btn ${previewId === feed.id ? "pvw-active" : ""}`}
                      onClick={() => {
                        setPreviewId(feed.id);
                        sendSwitcher({ previewId: feed.id });
                      }}
                    >
                      {feed.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="tbar-wrap">
                <p className="technical-label">Transition</p>
                <div className="transition-row">
                  <button type="button" className="transition-btn cut" onClick={runCutTransition}>
                    CUT
                  </button>
                  <button type="button" className="transition-btn auto" onClick={runAutoTransition}>
                    AUTO
                  </button>
                  <label className="transition-duration-field">
                    <span className="technical-label">Duration ms</span>
                    <input
                      type="number"
                      min={120}
                      max={8000}
                      step={20}
                      value={transitionDuration}
                      onChange={(e) => setTransitionDuration(Number(e.target.value))}
                    />
                  </label>
                </div>
                <p className="technical-label">T-Bar 0.0 — 1.0 (manual overrides AUTO)</p>
                <div className="tbar-column">
                  <div className="tbar-labels">
                    <span>1.0</span>
                    <span>0.0</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1000}
                    step={1}
                    value={Math.round(tbar01 * 1000)}
                    onChange={(e) => onTbarInput(Number(e.target.value) / 1000)}
                    className="tbar"
                    aria-label="Manual transition T-Bar"
                  />
                </div>
                <div className="mix-preview">
                  <span className="pvw-layer" style={{ opacity: 1 - tbar01 }}>{previewId.toUpperCase()}</span>
                  <span className="pgm-layer" style={{ opacity: tbar01 }}>{programId.toUpperCase()}</span>
                </div>
              </div>
            </div>
          </section>
        </section>

        <aside className="right-pane tactile-node">
          <h2 className="pane-title">Comms & Transport</h2>
          <section className="block">
            <p className="technical-label">Talkback Matrix</p>
            <div className="talk-grid">
              {FEEDS.map((feed) => (
                <button
                  key={`talk-${feed.id}`}
                  className={`talk-btn ${talk[feed.id] ? "on" : ""}`}
                  onClick={() => setTalk((prev) => ({ ...prev, [feed.id]: !prev[feed.id] }))}
                >
                  DIRECTOR TO {feed.label}
                </button>
              ))}
            </div>
          </section>
          <section className="block">
            <p className="technical-label">Stream Desk</p>
            <button className={`arm-btn ${recordArmed ? "on" : ""}`} onClick={() => setRecordArmed((v) => !v)}>
              {recordArmed ? "RECORD ARMED" : "ARM RECORD"}
            </button>
            <button className={`arm-btn ${streamArmed ? "on" : ""}`} onClick={() => setStreamArmed((v) => !v)}>
              {streamArmed ? "STREAM LIVE ARMED" : "ARM STREAM LIVE"}
            </button>
          </section>
          <section className="block">
            <p className="technical-label">System</p>
            <div className="sys-lines">
              <span>{connected ? "Vision WS + tally sync" : "Vision WS Offline"}</span>
              <span>{timecode} @24p</span>
              <span>Hotkeys: [1,2,3] PVW [Space] CUT [Enter] AUTO</span>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function nextTc(prev: string): string {
  const [h, m, s, f] = prev.split(":").map(Number);
  let nf = f + 1;
  let ns = s;
  let nm = m;
  let nh = h;
  if (nf >= 24) {
    nf = 0;
    ns += 1;
  }
  if (ns >= 60) {
    ns = 0;
    nm += 1;
  }
  if (nm >= 60) {
    nm = 0;
    nh = (nh + 1) % 24;
  }
  return [nh, nm, ns, nf].map((v) => String(v).padStart(2, "0")).join(":");
}

function linePath(points: number[], width: number, height: number): string {
  const step = width / (points.length - 1);
  return points
    .map((p, i) => {
      const x = i * step;
      const y = height - (p / 100) * height;
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}
