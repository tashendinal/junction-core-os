"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type OnAirMode = "preflight" | "rehearsal" | "live";

export function BroadcastStatusStrip() {
  const pathname = usePathname();
  const [timecode, setTimecode] = useState<string>("--:--:--:--");
  const [fps, setFps] = useState<number>(25);
  const [syncHint, setSyncHint] = useState<string>("");
  const [showMode, setShowMode] = useState<OnAirMode>("preflight");
  const [showLabel, setShowLabel] = useState<string>("");

  const hidden = pathname === "/login" || pathname === "/setup";

  useEffect(() => {
    if (hidden) return;
    let cancelled = false;

    const pollTc = async () => {
      try {
        const r = await fetch("/api/timecode", { credentials: "include", cache: "no-store" });
        if (!r.ok || cancelled) return;
        const d = (await r.json()) as {
          timecode?: string;
          fps?: number;
          syncHint?: string;
        };
        if (typeof d.timecode === "string") setTimecode(d.timecode);
        if (typeof d.fps === "number") setFps(d.fps);
        if (typeof d.syncHint === "string") setSyncHint(d.syncHint);
      } catch {
        /* offline */
      }
    };

    const pollAir = async () => {
      try {
        const r = await fetch("/api/on-air", { credentials: "include", cache: "no-store" });
        if (!r.ok || cancelled) return;
        const d = (await r.json()) as { session?: { mode?: OnAirMode; showLabel?: string } };
        if (d.session?.mode) setShowMode(d.session.mode);
        if (typeof d.session?.showLabel === "string") setShowLabel(d.session.showLabel);
      } catch {
        /* ignore */
      }
    };

    void pollTc();
    void pollAir();
    const ivTc = setInterval(pollTc, 500);
    const ivAir = setInterval(pollAir, 3000);
    return () => {
      cancelled = true;
      clearInterval(ivTc);
      clearInterval(ivAir);
    };
  }, [hidden, pathname]);

  if (hidden) return null;

  const live = showMode === "live";
  const rehearsal = showMode === "rehearsal";

  return (
    <div
      className={`broadcast-status-strip ${live ? "broadcast-status-strip--live" : ""} ${rehearsal ? "broadcast-status-strip--rehearsal" : ""}`}
      role="status"
    >
      <span className="broadcast-status-strip__show">
        {live ? (
          <strong className="broadcast-status-strip__pill broadcast-status-strip__pill--live">ON AIR</strong>
        ) : rehearsal ? (
          <strong className="broadcast-status-strip__pill broadcast-status-strip__pill--reh">REHEARSAL</strong>
        ) : (
          <span className="broadcast-status-strip__pill broadcast-status-strip__pill--pre">PREFLIGHT</span>
        )}
        {showLabel ? <span className="broadcast-status-strip__show-label mono">{showLabel}</span> : null}
      </span>
      <span className="broadcast-status-strip__tc mono" title="Facility timecode (server-synced)">
        TC {timecode}
      </span>
      <span className="broadcast-status-strip__meta technical-label">
        {fps} fps · {syncHint === "ptp_claimed" ? "PTP claim" : "wall sync"}
      </span>
    </div>
  );
}
