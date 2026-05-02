"use client";

import { TopNav } from "../components/TopNav";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_VISCA_PORT,
  type CameraControlCommand,
  type CameraVendor,
  VENDOR_HINT,
  VENDOR_LABEL,
} from "../../lib/cameraControlTypes";
import {
  CAMERA_MODELS,
  getCameraModelById,
  modelsGroupedByVendor,
  type CameraModelEntry,
} from "../../lib/cameraModelsCatalog";
import type { NdiCameraBinding } from "../../lib/ndiCameraBindingsTypes";
import { CameraControlDeck } from "./CameraControlDeck";
import { NdiEthernetBindings } from "./NdiEthernetBindings";
import { getOperatorProfile, type OperatorProfile } from "../../lib/controlApi";

const CUSTOM_MODEL_ID = "__custom__";

type LogLine = { at: string; text: string; ok?: boolean };
export default function CameraControlPage() {
  const [modelId, setModelId] = useState<string>("sony-fx3");
  const [customModel, setCustomModel] = useState(false);
  const [vendor, setVendor] = useState<CameraVendor>("sony");
  const [host, setHost] = useState("192.168.1.50");
  const [port, setPort] = useState(String(DEFAULT_VISCA_PORT));
  const [presetSlot, setPresetSlot] = useState(0);
  const [tryViscaOnSonyAlpha, setTryViscaOnSonyAlpha] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [profile, setProfile] = useState<OperatorProfile>({
    operatorProfileMode: "multi_vendor_software_defined",
    singleVendorProfile: null,
  });

  useEffect(() => {
    let mounted = true;
    void getOperatorProfile()
      .then((data) => {
        if (!mounted) return;
        setProfile({
          operatorProfileMode: data.operatorProfileMode ?? "multi_vendor_software_defined",
          singleVendorProfile: data.singleVendorProfile ?? null,
        });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (profile.operatorProfileMode !== "single_vendor_operator") return;
    if (profile.singleVendorProfile === "sony_stack") {
      setCustomModel(false);
      setModelId("sony-fx3");
      setVendor("sony");
    }
  }, [profile]);

  const selectedModel = useMemo(
    () => (customModel ? null : getCameraModelById(modelId)),
    [customModel, modelId]
  );

  useEffect(() => {
    if (customModel) return;
    const m = getCameraModelById(modelId);
    if (m) {
      setVendor(m.vendor);
      setPort(String(m.defaultViscaPort ?? DEFAULT_VISCA_PORT));
      if (m.vendor === "sony") {
        setTryViscaOnSonyAlpha(m.viscaUiEnabled);
      }
    }
  }, [modelId, customModel]);

  const showSonyVisca =
    vendor === "sony" && (Boolean(selectedModel?.viscaUiEnabled) || tryViscaOnSonyAlpha);

  const pushLog = useCallback((text: string, ok?: boolean) => {
    setLog((prev) => [{ at: new Date().toLocaleTimeString(), text, ok }, ...prev].slice(0, 24));
  }, []);

  const applyNdiBinding = useCallback(
    (b: NdiCameraBinding) => {
      const ip = b.controlHost.trim();
      if (ip) setHost(ip);
      setVendor(b.vendor);
      setPort(String(b.controlPort ?? DEFAULT_VISCA_PORT));
      if (b.modelId && getCameraModelById(b.modelId)) {
        setCustomModel(false);
        setModelId(b.modelId);
      }
      if (b.vendor === "sony") setTryViscaOnSonyAlpha(true);
      pushLog(`Deck ← ${b.feedId} @ ${ip || "?"} · NDI "${b.ndiSourceName || "—"}"`, true);
    },
    [pushLog]
  );

  const effectiveModelId = customModel ? undefined : modelId;

  const send = useCallback(
    async (command: CameraControlCommand, opts?: { skipBusy?: boolean }) => {
      const skipBusy = opts?.skipBusy === true;
      if (!skipBusy) setBusy(true);
      try {
        const pi =
          command === "preset_recall" || command === "preset_store"
            ? Math.min(15, Math.max(0, presetSlot))
            : undefined;
        const res = await fetch("/api/camera-control", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            vendor,
            host: host.trim(),
            port: vendor === "sony" && showSonyVisca ? parseInt(port, 10) || DEFAULT_VISCA_PORT : undefined,
            command,
            presetIndex: pi,
            modelId: effectiveModelId,
          }),
        });
        const data = (await res.json()) as Record<string, unknown>;
        if (!skipBusy) {
          if (res.ok && data.ok === true) {
            pushLog(`${command}: ${JSON.stringify(data)}`, true);
          } else {
            pushLog(`${command}: ${JSON.stringify(data)}`, false);
          }
        }
      } catch (e) {
        if (!skipBusy) {
          pushLog(e instanceof Error ? e.message : "request failed", false);
        }
      } finally {
        if (!skipBusy) setBusy(false);
      }
    },
    [effectiveModelId, host, port, presetSlot, vendor, showSonyVisca, pushLog]
  );

  const onModelChange = (id: string) => {
    if (id === CUSTOM_MODEL_ID) {
      setCustomModel(true);
      setTryViscaOnSonyAlpha(vendor === "sony");
      return;
    }
    setCustomModel(false);
    setModelId(id);
  };

  const grouped = useMemo(() => modelsGroupedByVendor(), []);

  const ccapiBase = `http://${host.trim() || "camera-ip"}:8080/ccapi`;

  return (
    <main className="tactical-root bcc-page">
      <TopNav />
      <div className="camera-control-shell camera-control-shell--wide">
        <header className="camera-control-header">
          <h1 className="pane-title bcc-title">Camera control</h1>
          <p className="camera-control-lede">
            <strong>NDI = picture & sound.</strong> This console sends parallel LAN commands (VISCA/IP where enabled). Layout
            inspired by compact colorist / camera operator surfaces.
          </p>
          <p className="cc-hint">
            Mode:{" "}
            <strong>
              {profile.operatorProfileMode === "single_vendor_operator"
                ? `single-vendor (${profile.singleVendorProfile || "custom"})`
                : "multi-vendor software-defined"}
            </strong>
          </p>
        </header>

        <NdiEthernetBindings onApplyBinding={applyNdiBinding} />

        <div className="bcc-console">
          <aside className="bcc-rack tactile-node">
            <h2 className="technical-label bcc-rack-heading">Connection</h2>
            <label className="cc-field">
              <span>Body</span>
              <select
                value={customModel ? CUSTOM_MODEL_ID : modelId}
                onChange={(e) => onModelChange(e.target.value)}
                disabled={profile.operatorProfileMode === "single_vendor_operator"}
              >
                {(Object.entries(grouped) as [CameraVendor, CameraModelEntry[]][]).map(([v, list]) => (
                  <optgroup key={v} label={VENDOR_LABEL[v].split("(")[0].trim()}>
                    {list.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value={CUSTOM_MODEL_ID}>— Custom —</option>
              </select>
            </label>

            {selectedModel ? (
              <p className="cc-hint cc-model-notes">{selectedModel.notes}</p>
            ) : (
              <p className="cc-hint">Pick a catalog body or Custom.</p>
            )}

            {customModel ? (
              <label className="cc-field">
                <span>Vendor</span>
                <select
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value as CameraVendor)}
                  disabled={profile.operatorProfileMode === "single_vendor_operator"}
                >
                  {(Object.keys(VENDOR_LABEL) as CameraVendor[]).map((v) => (
                    <option key={v} value={v}>
                      {VENDOR_LABEL[v]}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="cc-field">
                <span>Vendor</span>
                <input readOnly value={VENDOR_LABEL[vendor]} className="cc-readonly" />
              </label>
            )}

            <p className="cc-hint">{VENDOR_HINT[vendor]}</p>

            <label className="cc-field">
              <span>Host / IP</span>
              <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.x.x" />
            </label>

            {vendor === "sony" && showSonyVisca ? (
              <label className="cc-field">
                <span>VISCA UDP</span>
                <input type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} />
              </label>
            ) : null}

            {vendor === "sony" && (customModel || (selectedModel && !selectedModel.viscaUiEnabled)) ? (
              <label className="cc-check">
                <input
                  type="checkbox"
                  checked={tryViscaOnSonyAlpha}
                  onChange={(e) => setTryViscaOnSonyAlpha(e.target.checked)}
                />
                <span>VISCA/IP on α (gateway)</span>
              </label>
            ) : null}

            {vendor === "canon" ? (
              <p className="cc-hint">
                CCAPI: <code className="cc-code">{ccapiBase}</code>
              </p>
            ) : null}

            {vendor === "canon" || vendor === "nikon" || vendor === "red" ? (
              <button
                type="button"
                className="bcc-rack-probe"
                disabled={busy}
                onClick={() => void send("zoom_stop")}
              >
                Probe adapter
              </button>
            ) : null}
          </aside>

          <div className="bcc-stage">
            <CameraControlDeck
              showSonyVisca={showSonyVisca}
              busy={busy}
              vendor={vendor}
              send={send}
              customModel={customModel}
              selectedModel={selectedModel}
              presetSlot={presetSlot}
              setPresetSlot={setPresetSlot}
            />

            <section className="bcc-log tactile-node">
              <h2 className="technical-label">Command log</h2>
              {log.length === 0 ? <p className="cc-hint">No confirmations yet (drive commands are silent).</p> : null}
              <ul className="cc-log">
                {log.map((line, idx) => (
                  <li
                    key={`${line.at}-${idx}`}
                    className={line.ok === false ? "cc-log-err" : line.ok ? "cc-log-ok" : ""}
                  >
                    <span className="cc-log-time">{line.at}</span> {line.text}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <details className="bcc-details tactile-node">
          <summary className="bcc-details-summary">Device catalog ({CAMERA_MODELS.length} models)</summary>
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Vendor</th>
                  <th>Control path</th>
                  <th>VISCA UI</th>
                </tr>
              </thead>
              <tbody>
                {CAMERA_MODELS.map((m) => (
                  <tr key={m.id}>
                    <td>{m.label}</td>
                    <td>{m.vendor}</td>
                    <td>{m.controlBackend}</td>
                    <td>{m.viscaUiEnabled ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </main>
  );
}
