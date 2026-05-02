"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { CameraControlCommand, CameraVendor } from "../../lib/cameraControlTypes";
import type { CameraModelEntry } from "../../lib/cameraModelsCatalog";

type SendFn = (command: CameraControlCommand, opts?: { skipBusy?: boolean }) => Promise<void>;

const DRIVE_DEAD = 10;

type Props = {
  showSonyVisca: boolean;
  busy: boolean;
  vendor: CameraVendor;
  send: SendFn;
  customModel: boolean;
  selectedModel: CameraModelEntry | null;
  presetSlot: number;
  setPresetSlot: (n: number) => void;
};

/** Blackmagic-inspired surface: faders, rotary-style controls, preset pad. */
export function CameraControlDeck({
  showSonyVisca,
  busy,
  vendor,
  send,
  customModel,
  selectedModel,
  presetSlot,
  setPresetSlot,
}: Props) {
  const [zoomDrive, setZoomDrive] = useState(0);
  const [focusDrive, setFocusDrive] = useState(0);
  const [zoomSpeed, setZoomSpeed] = useState(72);
  const [focusSpeed, setFocusSpeed] = useState(72);
  const [exposureMode, setExposureMode] = useState<"auto" | "manual">("auto");
  const [shutterUi, setShutterUi] = useState(180);
  const [gainUi, setGainUi] = useState(35);
  const [wbTintUi, setWbTintUi] = useState(0);

  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    if (!showSonyVisca) return;
    const z = zoomDrive;
    if (Math.abs(z) <= DRIVE_DEAD) {
      return;
    }
    const cmd: CameraControlCommand = z < 0 ? "zoom_wide" : "zoom_tele";
    const ms = Math.max(55, 280 - zoomSpeed * 2.4);
    const t = window.setInterval(() => {
      void sendRef.current(cmd, { skipBusy: true });
    }, ms);
    return () => {
      window.clearInterval(t);
      void sendRef.current("zoom_stop", { skipBusy: true });
    };
  }, [zoomDrive, zoomSpeed, showSonyVisca]);

  useEffect(() => {
    if (!showSonyVisca) return;
    const f = focusDrive;
    if (Math.abs(f) <= DRIVE_DEAD) {
      return;
    }
    const cmd: CameraControlCommand = f < 0 ? "focus_near" : "focus_far";
    const ms = Math.max(55, 280 - focusSpeed * 2.4);
    const t = window.setInterval(() => {
      void sendRef.current(cmd, { skipBusy: true });
    }, ms);
    return () => {
      window.clearInterval(t);
      void sendRef.current("focus_stop", { skipBusy: true });
    };
  }, [focusDrive, focusSpeed, showSonyVisca]);

  const onExposureAuto = useCallback(() => {
    setExposureMode("auto");
    void send("exposure_auto");
  }, [send]);

  const onExposureManual = useCallback(() => {
    setExposureMode("manual");
    void send("exposure_manual");
  }, [send]);

  if (!showSonyVisca) {
    if (vendor === "sony") {
      return (
        <div className="bcc-deck bcc-deck--inactive">
          <div className="bcc-deck-message">
            <p className="bcc-deck-title">VISCA/IP path disabled</p>
            <p className="bcc-deck-sub">
              Enable <strong>Send VISCA/IP</strong> in the connection panel for α bodies, or select <strong>Sony FX3</strong>.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="bcc-deck bcc-deck--inactive">
        <div className="bcc-deck-message">
          <p className="bcc-deck-title">Control surface</p>
          <p className="bcc-deck-sub">
            Live faders and pads activate when a Sony VISCA target is available. Use <strong>Probe adapter</strong> below for
            other brands.
          </p>
          <button type="button" className="bcc-pad-btn bcc-pad-btn--wide" disabled={busy} onClick={() => send("zoom_stop")}>
            Probe adapter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bcc-deck">
      {showSonyVisca && (customModel || (selectedModel && !selectedModel.viscaUiEnabled)) ? (
        <div className="bcc-banner">Experimental VISCA — confirm UDP target.</div>
      ) : null}

      <div className="bcc-deck-grid">
        <section className="bcc-module">
          <header className="bcc-module-head">
            <span className="bcc-module-title">Lens</span>
            <span className="bcc-module-tag">zoom</span>
          </header>
          <div className="bcc-fader-block">
            <div className="bcc-fader-labels">
              <span>WIDE</span>
              <span>STOP</span>
              <span>TELE</span>
            </div>
            <input
              type="range"
              className="bcc-rail bcc-rail--zoom"
              min={-100}
              max={100}
              value={zoomDrive}
              onChange={(e) => setZoomDrive(Number(e.target.value))}
            />
            <div className="bcc-fader-meta">
              <span className="bcc-readout">{zoomDrive === 0 ? "—" : zoomDrive < 0 ? `${zoomDrive}` : `+${zoomDrive}`}</span>
            </div>
          </div>
          <div className="bcc-knob-row">
            <div className="bcc-knob">
              <label className="bcc-knob-label">Zoom rate</label>
              <input
                type="range"
                className="bcc-knob-input"
                min={0}
                max={100}
                value={zoomSpeed}
                onChange={(e) => setZoomSpeed(Number(e.target.value))}
              />
              <span className="bcc-knob-value">{zoomSpeed}%</span>
            </div>
            <button type="button" className="bcc-stop-cap" onClick={() => setZoomDrive(0)}>
              Stop zoom
            </button>
          </div>
        </section>

        <section className="bcc-module">
          <header className="bcc-module-head">
            <span className="bcc-module-title">Focus</span>
            <span className="bcc-module-tag">near · far</span>
          </header>
          <div className="bcc-fader-block">
            <div className="bcc-fader-labels">
              <span>NEAR</span>
              <span>HOLD</span>
              <span>FAR</span>
            </div>
            <input
              type="range"
              className="bcc-rail bcc-rail--focus"
              min={-100}
              max={100}
              value={focusDrive}
              onChange={(e) => setFocusDrive(Number(e.target.value))}
            />
            <div className="bcc-fader-meta">
              <span className="bcc-readout">{focusDrive === 0 ? "—" : focusDrive < 0 ? `${focusDrive}` : `+${focusDrive}`}</span>
            </div>
          </div>
          <div className="bcc-knob-row">
            <div className="bcc-knob">
              <label className="bcc-knob-label">Focus rate</label>
              <input
                type="range"
                className="bcc-knob-input"
                min={0}
                max={100}
                value={focusSpeed}
                onChange={(e) => setFocusSpeed(Number(e.target.value))}
              />
              <span className="bcc-knob-value">{focusSpeed}%</span>
            </div>
            <div className="bcc-focus-actions">
              <button type="button" className="bcc-chip" disabled={busy} onClick={() => void send("focus_auto")}>
                AFS
              </button>
              <button type="button" className="bcc-stop-cap" onClick={() => setFocusDrive(0)}>
                Stop focus
              </button>
            </div>
          </div>
        </section>

        <section className="bcc-module bcc-module--wide">
          <header className="bcc-module-head">
            <span className="bcc-module-title">Exposure</span>
            <span className="bcc-module-tag">VISCA AE</span>
          </header>
          <div className="bcc-segmented">
            <button
              type="button"
              className={`bcc-seg ${exposureMode === "auto" ? "is-on" : ""}`}
              disabled={busy}
              onClick={onExposureAuto}
            >
              Auto
            </button>
            <button
              type="button"
              className={`bcc-seg ${exposureMode === "manual" ? "is-on" : ""}`}
              disabled={busy}
              onClick={onExposureManual}
            >
              Manual
            </button>
          </div>
          <div className="bcc-dual-fader">
            <div className="bcc-mini-fader">
              <label>Shutter ° (UI)</label>
              <input
                type="range"
                min={45}
                max={360}
                value={shutterUi}
                onChange={(e) => setShutterUi(Number(e.target.value))}
              />
              <span className="bcc-mini-readout">{shutterUi}°</span>
            </div>
            <div className="bcc-mini-fader">
              <label>Gain % (UI)</label>
              <input type="range" min={0} max={100} value={gainUi} onChange={(e) => setGainUi(Number(e.target.value))} />
              <span className="bcc-mini-readout">{gainUi}%</span>
            </div>
          </div>
          <p className="bcc-footnote">Shutter / gain sliders are local preview; wire to CCAPI or extended VISCA later.</p>
        </section>

        <section className="bcc-module bcc-module--wide">
          <header className="bcc-module-head">
            <span className="bcc-module-title">Color</span>
            <span className="bcc-module-tag">WB</span>
          </header>
          <div className="bcc-color-row">
            <button type="button" className="bcc-pill" disabled={busy} onClick={() => void send("wb_auto")}>
              Auto WB
            </button>
            <button type="button" className="bcc-pill bcc-pill--accent" disabled={busy} onClick={() => void send("wb_one_push")}>
              One-push
            </button>
          </div>
          <div className="bcc-tint-fader">
            <label>Tint (UI only)</label>
            <input
              type="range"
              min={-50}
              max={50}
              value={wbTintUi}
              onChange={(e) => setWbTintUi(Number(e.target.value))}
            />
            <span className="bcc-mini-readout">{wbTintUi > 0 ? `+${wbTintUi}` : wbTintUi}</span>
          </div>
        </section>

        <section className="bcc-module bcc-module--presets">
          <header className="bcc-module-head">
            <span className="bcc-module-title">Presets</span>
            <span className="bcc-module-tag">0–15</span>
          </header>
          <div className="bcc-preset-grid">
            {Array.from({ length: 16 }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`bcc-pad ${presetSlot === i ? "is-selected" : ""}`}
                disabled={busy}
                onClick={() => setPresetSlot(i)}
              >
                {i}
              </button>
            ))}
          </div>
          <div className="bcc-preset-actions">
            <button type="button" className="bcc-pad-btn bcc-pad-btn--recall" disabled={busy} onClick={() => void send("preset_recall")}>
              Recall
            </button>
            <button type="button" className="bcc-pad-btn bcc-pad-btn--store" disabled={busy} onClick={() => void send("preset_store")}>
              Store
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
