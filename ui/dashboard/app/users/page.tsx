"use client";

import { TopNav } from "../components/TopNav";
import React, { useEffect, useState } from "react";

type Role = "system_admin" | "live_production" | "viewer";
type User = {
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
  updatedAt: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    role: "viewer" as Role,
    password: "",
  });

  const load = async () => {
    const res = await fetch("/api/users");
    const data = (await res.json()) as { users?: User[]; error?: string };
    if (!res.ok) {
      setStatus(data.error || "Failed to load users");
      return;
    }
    setUsers(data.users || []);
  };

  useEffect(() => {
    void load();
  }, []);

  const createUser = async () => {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await res.json()) as { users?: User[]; error?: string };
    if (!res.ok) {
      setStatus(data.error || "Create failed");
      return;
    }
    setUsers(data.users || []);
    setStatus(`Created user ${form.username}`);
    setForm({ username: "", displayName: "", role: "viewer", password: "" });
  };

  const toggleActive = async (u: User) => {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u.username, active: !u.active }),
    });
    const data = (await res.json()) as { users?: User[]; error?: string };
    if (!res.ok) {
      setStatus(data.error || "Update failed");
      return;
    }
    setUsers(data.users || []);
    setStatus(`${u.username} is now ${u.active ? "inactive" : "active"}`);
  };

  const changeRole = async (u: User, role: Role) => {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u.username, role }),
    });
    const data = (await res.json()) as { users?: User[]; error?: string };
    if (!res.ok) {
      setStatus(data.error || "Role update failed");
      return;
    }
    setUsers(data.users || []);
    setStatus(`${u.username} role updated`);
  };

  return (
    <main className="tactical-root">
      <TopNav />

      <section className="tactile-node fiber-shell">
        <header className="diag-header">
          <h1 className="pane-title">User Management</h1>
          <p className="technical-label">System admin can create users, assign roles, and disable accounts.</p>
        </header>
        <article className="diag-card">
          <h2 className="pane-title">Create User</h2>
          <div className="fiber-form">
            <label><span className="technical-label">Username</span><input value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} /></label>
            <label><span className="technical-label">Display Name</span><input value={form.displayName} onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))} /></label>
            <label>
              <span className="technical-label">Role</span>
              <select className="rack-select" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as Role }))}>
                <option value="system_admin">System Admin</option>
                <option value="live_production">Live Production</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <label><span className="technical-label">Password</span><input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} /></label>
          </div>
          <div className="fiber-actions">
            <button className="rack-save-btn" onClick={() => void createUser()}>Create</button>
            <button className="rack-save-btn" onClick={() => void load()}>Refresh</button>
          </div>
          <p className="remap-status mono">{status}</p>
        </article>

        <article className="diag-card">
          <h2 className="pane-title">Users</h2>
          <div className="noc-node-grid">
            {users.map((u) => (
              <div key={u.username} className="wan-provider-card">
                <div className="wan-provider-head">
                  <strong>{u.displayName}</strong>
                  <span className="technical-label">{u.username}</span>
                </div>
                <div className="kv-list compact">
                  <div><span>Role</span><strong>{u.role}</strong></div>
                  <div><span>Status</span><strong>{u.active ? "ACTIVE" : "INACTIVE"}</strong></div>
                  <div><span>Updated</span><strong>{new Date(u.updatedAt).toLocaleTimeString()}</strong></div>
                </div>
                <div className="fiber-actions">
                  <button className="rack-save-btn" onClick={() => void toggleActive(u)}>
                    {u.active ? "Disable" : "Enable"}
                  </button>
                  <button className="rack-save-btn" onClick={() => void changeRole(u, "system_admin")}>Admin</button>
                  <button className="rack-save-btn" onClick={() => void changeRole(u, "live_production")}>Production</button>
                  <button className="rack-save-btn" onClick={() => void changeRole(u, "viewer")}>Viewer</button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
