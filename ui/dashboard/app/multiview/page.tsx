"use client";

import React, { useEffect, useMemo, useState } from "react";
import { TopNav } from "../components/TopNav";
import { feedNdiPresence, parseNdiSources, type FeedDef, type NdiSourceParsed } from "../../lib/ndiFeedStatus";

const FEEDS: FeedDef[] = [
  { id: "cam1", label: "CAM 1" },
  { id: "cam2", label: "CAM 2" },
  { id: "cam3", label: "CAM 3" },
];

const WS_URL = process.env.NEXT_PUBLIC_VISION_WS ?? "ws://localhost:9000/ws";

type SwitcherState = { programId: string; previewId: string; tbar: number };

export default function MultiviewPage() {
  const wsRef = React.useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [programId, setProgramId] = useState("cam2");
  const [previewId, setPreviewId] = useState("cam1");
  const [tbar, setTbar] = useState(0);
  const [timecode, setTimecode] = useState("00:00:00:00");
  const [currentNdiSources, setCurrentNdiSources] = useState<NdiSourceParsed[]>([]);
  const [ndiLastSeen, setNdiLastSeen] = useState<Record<string, number>>({});
  const [ndiScanMeta, setNdiScanMeta] = useState<{ scannedAtMs: number; intervalSec: number } | null>(null);

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
        if (msgType === "ndi" && Array.isArray(payload.sources)) {
          const parsed = parseNdiSources(payload.sources);
          const scanned = typeof payload.scannedAtUnixMs === "number" ? payload.scannedAtUnixMs : Date.now();
          const intervalSec = typeof payload.scanIntervalSec === "number" ? payload.scanIntervalSec : 5;
          setCurrentNdiSources(parsed);
          setNdiScanMeta({ scannedAtMs: scanned, intervalSec });
          setNdiLastSeen((prev) => {
            const next = { ...prev };
            for (const s of parsed) next[s.name.toLowerCase()] = scanned;
            return next;
          });
          return;
        }
        if (msgType === "switcher") {
          const s = payload as Partial<SwitcherState>;
          if (typeof s.programId === "string") setProgramId(s.programId);
          if (typeof s.previewId === "string") setPreviewId(s.previewId);
          if (typeof s.tbar === "number") setTbar(Math.min(1, Math.max(0, s.tbar)));
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

  const sendSwitcher = React.useCallback((patch: Partial<SwitcherState>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "switcher",
        programId: patch.programId ?? programId,
        previewId: patch.previewId ?? previewId,
        tbar: patch.tbar ?? tbar,
      })
    );
  }, [programId, previewId, tbar]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimecode((prev) => nextTc(prev));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const lastSeenMap = useMemo(() => new Map(Object.entries(ndiLastSeen)), [ndiLastSeen]);
  const cameraFeeds = useMemo(() => {
    return FEEDS.map((feed) => {
      const { presence, matchedName } = feedNdiPresence(feed, currentNdiSources, lastSeenMap, {});
      return {
        ...feed,
        presence,
        matchedName,
        histogram: Array.from({ length: 24 }, () => Math.round(18 + Math.random() * 76)),
      };
    });
  }, [currentNdiSources, lastSeenMap, timecode]);

  return (
    <main className="tactical-root mv-page">
      <TopNav />
      <section className="mv-shell tactile-node">
        <header className="mv-head">
          <h1 className="pane-title">Master Multiview</h1>
          <div className="mv-status">
            <span>{connected ? "Vision WS Online" : "Vision WS Offline"}</span>
            <span>
              PGM {programId.toUpperCase()} · PVW {previewId.toUpperCase()} · TBAR {tbar.toFixed(2)}
            </span>
            <span>{timecode} @24p</span>
            {ndiScanMeta ? (
              <span>
                NDI scan {ndiScanMeta.intervalSec}s · {new Date(ndiScanMeta.scannedAtMs).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
          <div className="mv-preview-select">
            <span className="technical-label">Preview selectors</span>
            {FEEDS.map((feed) => (
              <button
                key={`mv-pvw-${feed.id}`}
                type="button"
                className={`mv-preview-btn ${previewId === feed.id ? "active" : ""}`}
                onClick={() => {
                  setPreviewId(feed.id);
                  sendSwitcher({ previewId: feed.id });
                }}
              >
                {feed.label}
              </button>
            ))}
          </div>
          <div className="mv-preview-select">
            <span className="technical-label">Program selectors</span>
            {FEEDS.map((feed) => (
              <button
                key={`mv-pgm-${feed.id}`}
                type="button"
                className={`mv-preview-btn mv-program-btn ${programId === feed.id ? "active" : ""}`}
                onClick={() => {
                  setProgramId(feed.id);
                  sendSwitcher({ programId: feed.id });
                }}
              >
                {feed.label}
              </button>
            ))}
          </div>
        </header>
        <div className="mv-grid">
          {cameraFeeds.map((feed) => {
            const tallyClass = programId === feed.id ? "program" : previewId === feed.id ? "preview" : "standby";
            const ndiLabel = feed.presence === "live" ? "LIVE" : feed.presence === "stale" ? "STALE" : "STBY";
            return (
              <article key={feed.id} className={`mv-tile ${tallyClass}`}>
                {programId === feed.id ? <span className="tally-ribbon pgm">PGM</span> : null}
                {previewId === feed.id && programId !== feed.id ? <span className="tally-ribbon pvw">PVW</span> : null}
                <div className="cam-head">
                  <strong>{feed.label}</strong>
                  <span className={`ndi-presence ndi-${feed.presence}`}>{ndiLabel}</span>
                </div>
                <div className="mv-screen">
                  <span>{feed.label}</span>
                </div>
                <div className="osd">
                  <div>{feed.matchedName ? `Src: ${feed.matchedName}` : "NDI source awaiting match"}</div>
                  <div className="hist">
                    {feed.histogram.map((h, i) => (
                      <span key={`${feed.id}-h-${i}`} style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
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
