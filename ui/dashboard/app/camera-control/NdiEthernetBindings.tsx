"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { CameraVendor } from "../../lib/cameraControlTypes";
import { DEFAULT_VISCA_PORT, VENDOR_LABEL } from "../../lib/cameraControlTypes";
import type { NdiCameraBinding, NdiCameraBindingsDoc } from "../../lib/ndiCameraBindingsTypes";

type DiscoveredSource = { name: string; url_address?: string | null };

export type NdiEthernetBindingsProps = {
  onApplyBinding: (b: NdiCameraBinding) => void;
};

export function NdiEthernetBindings({ onApplyBinding }: NdiEthernetBindingsProps) {
  const [doc, setDoc] = useState<NdiCameraBindingsDoc | null>(null);
  const [sources, setSources] = useState<DiscoveredSource[]>([]);
  const [scanMeta, setScanMeta] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadBindings = useCallback(async () => {
    const r = await fetch("/api/ndi-camera-bindings", { credentials: "include" });
    const j = await r.json();
    if (!r.ok) {
      setMsg(j.error || "Bindings load failed");
      return;
    }
    setDoc(j as NdiCameraBindingsDoc);
    setMsg(null);
  }, []);

  const refreshDiscovery = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/vision/ndi-snapshot", { cache: "no-store" });
      const j = (await r.json()) as {
        sources?: DiscoveredSource[];
        scannedAtUnixMs?: number;
        error?: string;
      };
      if (Array.isArray(j.sources)) {
        setSources(j.sources);
        setScanMeta(
          j.scannedAtUnixMs
            ? `Scan ${new Date(j.scannedAtUnixMs).toLocaleTimeString()} · ${j.sources.length} source(s)`
            : `${j.sources.length} source(s)`
        );
      } else {
        setSources([]);
        setScanMeta(j.error || "No sources");
      }
    } catch {
      setSources([]);
      setScanMeta("Discovery failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadBindings();
    void refreshDiscovery();
  }, [loadBindings, refreshDiscovery]);

  const save = async () => {
    if (!doc) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/ndi-camera-bindings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bindings: doc.bindings }),
      });
      const j = await r.json();
      if (!r.ok) {
        setMsg(j.error || "Save failed");
        return;
      }
      setDoc(j.doc as NdiCameraBindingsDoc);
      setMsg("Bindings saved.");
    } catch {
      setMsg("Network error");
    } finally {
      setBusy(false);
    }
  };

  const patchBinding = (feedId: string, patch: Partial<NdiCameraBinding>) => {
    setDoc((d) => {
      if (!d) return d;
      return {
        ...d,
        bindings: d.bindings.map((b) => (b.feedId === feedId ? { ...b, ...patch } : b)),
      };
    });
  };

  if (!doc) {
    return (
      <section className="ncc-ndi tactile-node">
        <p className="technical-label">Loading direct Ethernet / NDI bindings…</p>
      </section>
    );
  }

  return (
    <section className="ncc-ndi tactile-node">
      <header className="ncc-ndi-head">
        <div>
          <h2 className="pane-title">Direct Ethernet NDI cameras</h2>
          <p className="technical-label">
            NDI carries picture/audio over your cable. Enter each camera&apos;s <strong>control IP</strong> on that link for
            VISCA/CCAPI from this deck. Match <strong>NDI source name</strong> to Switcher aliases / discovery.
          </p>
        </div>
        <div className="ncc-ndi-actions">
          <button type="button" className="rack-save-btn" disabled={busy} onClick={() => void refreshDiscovery()}>
            Refresh NDI list
          </button>
          <button type="button" className="rack-save-btn" disabled={busy} onClick={() => void save()}>
            Save bindings
          </button>
        </div>
      </header>

      <p className="cc-hint mono">{scanMeta}</p>
      {sources.length > 0 ? (
        <label className="cc-field">
          <span>Pick discovered name → slot</span>
          <select
            className="rack-select"
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const [feedId, name] = v.split("::");
              if (feedId && name) patchBinding(feedId, { ndiSourceName: name });
              e.target.value = "";
            }}
          >
            <option value="">— assign discovery to CAM —</option>
            {doc.bindings.map((b) =>
              sources.map((s) => (
                <option key={`${b.feedId}-${s.name}`} value={`${b.feedId}::${s.name}`}>
                  {b.label}: {s.name}
                </option>
              ))
            )}
          </select>
        </label>
      ) : null}

      <div className="ncc-ndi-grid">
        {doc.bindings.map((b) => (
          <article key={b.feedId} className="ncc-ndi-card tactile-node">
            <h3 className="technical-label">{b.label}</h3>
            <label className="cc-field">
              <span>NDI source name</span>
              <input
                value={b.ndiSourceName}
                onChange={(e) => patchBinding(b.feedId, { ndiSourceName: e.target.value })}
                placeholder="e.g. CAM-1 (NDI)"
              />
            </label>
            <label className="cc-field">
              <span>Control IP (Ethernet to camera)</span>
              <input
                value={b.controlHost}
                onChange={(e) => patchBinding(b.feedId, { controlHost: e.target.value })}
                placeholder="192.168.x.x"
              />
            </label>
            <label className="cc-field">
              <span>VISCA / control UDP port</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={b.controlPort ?? DEFAULT_VISCA_PORT}
                onChange={(e) =>
                  patchBinding(b.feedId, {
                    controlPort: parseInt(e.target.value, 10) || DEFAULT_VISCA_PORT,
                  })
                }
              />
            </label>
            <label className="cc-field">
              <span>Vendor</span>
              <select
                className="rack-select"
                value={b.vendor}
                onChange={(e) => patchBinding(b.feedId, { vendor: e.target.value as CameraVendor })}
              >
                {(Object.keys(VENDOR_LABEL) as CameraVendor[]).map((v) => (
                  <option key={v} value={v}>
                    {VENDOR_LABEL[v]}
                  </option>
                ))}
              </select>
            </label>
            <label className="cc-field">
              <span>Camera Web UI (optional)</span>
              <input
                value={b.webUiUrl || ""}
                onChange={(e) => patchBinding(b.feedId, { webUiUrl: e.target.value || undefined })}
                placeholder="http://192.168.x.x/"
              />
            </label>
            <label className="cc-field">
              <span>Notes</span>
              <input
                value={b.notes || ""}
                onChange={(e) => patchBinding(b.feedId, { notes: e.target.value })}
              />
            </label>
            <div className="ncc-ndi-row">
              <button type="button" className="bcc-rack-probe" onClick={() => onApplyBinding(b)}>
                Apply to control deck
              </button>
              {b.webUiUrl ? (
                <a className="ncc-ndi-link" href={b.webUiUrl} target="_blank" rel="noreferrer">
                  Open Web UI
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {msg ? <p className="remap-status mono">{msg}</p> : null}
    </section>
  );
}
