"use client";

import { TopNav } from "../components/TopNav";
import React, { useEffect, useState } from "react";

export default function BackupPage() {
  const [backups, setBackups] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState("Create a backup before major operations.");

  const load = async () => {
    const res = await fetch("/api/backups");
    if (!res.ok) return;
    const data = (await res.json()) as { backups: string[] };
    setBackups(data.backups || []);
    setSelected((prev) => prev || data.backups?.[0] || "");
  };

  useEffect(() => {
    void load();
  }, []);

  const createBackup = async () => {
    const res = await fetch("/api/backups", { method: "POST" });
    setStatus(res.ok ? "Backup created." : "Backup create failed.");
    await load();
  };

  const restoreBackup = async () => {
    if (!selected) return;
    const res = await fetch("/api/backups/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ backupName: selected }),
    });
    setStatus(res.ok ? `Restored ${selected}` : "Restore failed.");
  };

  return (
    <main className="tactical-root">
      <TopNav />

      <section className="tactile-node fiber-shell">
        <header className="diag-header">
          <h1 className="pane-title">Backup & Restore</h1>
          <p className="technical-label">Protect operational configs and recover quickly.</p>
        </header>
        <article className="diag-card">
          <div className="fiber-actions">
            <button className="rack-save-btn" onClick={() => void createBackup()}>Create Backup</button>
            <button className="rack-save-btn" onClick={() => void load()}>Refresh List</button>
          </div>
          <label className="role-field">
            <span className="technical-label">Select Backup</span>
            <select className="rack-select" value={selected} onChange={(e) => setSelected(e.target.value)}>
              {backups.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <button className="rack-save-btn" onClick={() => void restoreBackup()} disabled={!selected}>Restore Selected</button>
          <p className="remap-status mono">{status}</p>
        </article>
      </section>
    </main>
  );
}
