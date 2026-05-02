"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [activated, setActivated] = useState(false);
  const [status, setStatus] = useState("Checking activation state...");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [hardwareId, setHardwareId] = useState("junction-core-main");
  const [activationCode, setActivationCode] = useState("");
  const [reconfigToken, setReconfigToken] = useState("");

  const load = async () => {
    const res = await fetch("/api/setup");
    const data = (await res.json()) as { activated?: boolean };
    const isActivated = Boolean(data.activated);
    setActivated(isActivated);
    setStatus(isActivated ? "System already activated." : "First-time activation required.");
  };

  useEffect(() => {
    void load();
  }, []);

  const activate = async () => {
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "activate",
        username,
        password,
        hardwareId,
        activationCode,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setStatus(data.error || "Activation failed");
      return;
    }
    setStatus("Activation complete. Redirecting...");
    router.push("/");
    router.refresh();
  };

  const enableReconfigure = async () => {
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "enable_reconfigure",
        activationCode,
        reconfigToken,
      }),
    });
    const data = (await res.json()) as { error?: string };
    setStatus(res.ok ? "Reconfigure mode enabled for system admin." : data.error || "Failed");
  };

  return (
    <main className="login-shell">
      <section className="login-card tactile-node">
        <h1 className="pane-title">Hardware Activation & Reconfigure</h1>
        <p className="technical-label">{status}</p>
        {!activated ? (
          <div className="login-form">
            <label>
              <span className="technical-label">System Admin Username</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label>
              <span className="technical-label">System Admin Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label>
              <span className="technical-label">Hardware ID</span>
              <input value={hardwareId} onChange={(e) => setHardwareId(e.target.value)} />
            </label>
            <label>
              <span className="technical-label">Activation Code (store securely)</span>
              <input type="password" value={activationCode} onChange={(e) => setActivationCode(e.target.value)} />
            </label>
            <button onClick={() => void activate()}>Activate Hardware</button>
          </div>
        ) : (
          <div className="login-form">
            <label>
              <span className="technical-label">Activation Code</span>
              <input type="password" value={activationCode} onChange={(e) => setActivationCode(e.target.value)} />
            </label>
            <label>
              <span className="technical-label">New Reconfigure Token</span>
              <input type="password" value={reconfigToken} onChange={(e) => setReconfigToken(e.target.value)} />
            </label>
            <button onClick={() => void enableReconfigure()}>Enable Admin Reconfigure</button>
          </div>
        )}
      </section>
    </main>
  );
}
