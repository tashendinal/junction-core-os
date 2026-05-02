"use client";

import { TopNav } from "../components/TopNav";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ReadinessStatus = "pass" | "warn" | "fail";
type ReadinessCheck = { id: string; label: string; status: ReadinessStatus; detail: string };
type BroadcastProfile = { id: string; name: string; protocol: string; enabled: boolean };

export default function ReadinessPage() {
  const router = useRouter();
  const [overall, setOverall] = useState<ReadinessStatus>("warn");
  const [checks, setChecks] = useState<ReadinessCheck[]>([]);
  const [profiles, setProfiles] = useState<BroadcastProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>("");
  const [statusText, setStatusText] = useState("Run preflight checks before going live.");

  const load = async () => {
    const [rRes, pRes] = await Promise.all([fetch("/api/readiness"), fetch("/api/broadcast-profiles")]);
    if (rRes.ok) {
      const r = (await rRes.json()) as { overall: ReadinessStatus; checks: ReadinessCheck[] };
      setOverall(r.overall);
      setChecks(r.checks || []);
    }
    if (pRes.ok) {
      const p = (await pRes.json()) as { profiles: BroadcastProfile[] };
      setProfiles(p.profiles || []);
      const current = (p.profiles || []).find((item) => item.enabled);
      setSelectedProfile(current?.id || p.profiles?.[0]?.id || "");
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, []);

  const runSafeMode = async () => {
    const res = await fetch("/api/readiness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "live_safe_mode" }),
    });
    setStatusText(res.ok ? "Live Safe Mode enabled (priority failover + stream guard)." : "Safe mode action failed.");
  };

  const applyProfile = async () => {
    if (!selectedProfile) return;
    const res = await fetch("/api/readiness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "apply_profile", profileId: selectedProfile }),
    });
    setStatusText(res.ok ? `Applied profile ${selectedProfile}` : "Profile apply failed.");
    await load();
  };

  const sendCriticalAlert = async () => {
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        severity: overall === "fail" ? "critical" : overall === "warn" ? "warning" : "info",
        title: "Go Live Readiness Status",
        message: `Overall status: ${overall.toUpperCase()}. Check dashboard readiness page.`,
      }),
    });
    setStatusText(res.ok ? "Notification sent to configured channels." : "Notification send failed.");
  };

  return (
    <main className="tactical-root">
      <TopNav />

      <section className="tactile-node fiber-shell">
        <header className="diag-header">
          <h1 className="pane-title">Go Live Readiness</h1>
          <p className="technical-label">
            Automated preflight checks + broadcast safe actions. Includes <strong>ISO recorder</strong> HTTP reachability from{" "}
            <code className="mono">recording-rack.json</code>, plus optional <strong>GPU module</strong> readiness from{" "}
            <code className="mono">gpu-modules.json</code> and <strong>overlay</strong> readiness from{" "}
            <code className="mono">overlay-modules.json</code> (set <code className="mono">READINESS_SKIP_ISO=1</code> /{" "}
            <code className="mono">READINESS_SKIP_GPU=1</code> / <code className="mono">READINESS_SKIP_OVERLAY=1</code> to skip).
          </p>
        </header>

        <div className="fiber-grid">
          <article className="diag-card">
            <h2 className="pane-title">Preflight Status</h2>
            <p className={`readiness-overall readiness-${overall}`}>Overall: {overall.toUpperCase()}</p>
            <div className="noc-alerts">
              {checks.map((check) => (
                <div key={check.id} className={`noc-alert noc-alert-${check.status === "pass" ? "info" : check.status}`}>
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="diag-card">
            <h2 className="pane-title">Broadcast Profiles</h2>
            <label className="role-field">
              <span className="technical-label">Contribution/Distribution Profile</span>
              <select className="rack-select" value={selectedProfile} onChange={(e) => setSelectedProfile(e.target.value)}>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} ({profile.protocol.toUpperCase()}) {profile.enabled ? " - active" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="fiber-actions">
              <button className="rack-save-btn" onClick={() => void applyProfile()}>Apply profile</button>
              <button className="rack-save-btn" onClick={() => void runSafeMode()}>Enable Live Safe Mode</button>
              <button className="rack-save-btn" onClick={() => void sendCriticalAlert()}>Send Alert</button>
              <button className="rack-save-btn" onClick={() => router.push("/backup")}>Open Backup</button>
              <button className="rack-save-btn" onClick={() => void load()}>Re-run preflight</button>
            </div>
            <p className="remap-status mono">{statusText}</p>
          </article>
        </div>
      </section>
    </main>
  );
}
