"use client";

import React, { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type ChannelId = "cam1" | "cam2" | "cam3";

const CHANNELS: { id: ChannelId; label: string }[] = [
  { id: "cam1", label: "CAM 1" },
  { id: "cam2", label: "CAM 2" },
  { id: "cam3", label: "CAM 3" },
];

export default function TalkbackAudioHubPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [talkbackMatrix, setTalkbackMatrix] = useState<Record<ChannelId, boolean>>({
    cam1: false,
    cam2: false,
    cam3: false,
  });
  const [masterCall, setMasterCall] = useState(false);

  const [ndiInput1, setNdiInput1] = useState(68);
  const [ndiInput2, setNdiInput2] = useState(63);
  const [ndiInput3, setNdiInput3] = useState(71);
  const [talkbackVolume, setTalkbackVolume] = useState(58);
  const [masterProgramOut, setMasterProgramOut] = useState(76);

  const micActive = useMemo(
    () => ({
      cam1: masterCall || talkbackMatrix.cam1,
      cam2: masterCall || talkbackMatrix.cam2,
      cam3: masterCall || talkbackMatrix.cam3,
    }),
    [masterCall, talkbackMatrix]
  );

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
      <section className="tactile-node hub-shell">
        <header className="hub-header">
          <h1 className="pane-title">Talkback & Audio Hub</h1>
          <p className="technical-label">WiTalk-linked tactical communication matrix</p>
        </header>

        <section className="hub-grid">
          <article className="hub-panel">
            <h2 className="pane-title">Talkback Matrix</h2>
            <div className="matrix-grid">
              {CHANNELS.map((channel) => (
                <button
                  key={channel.id}
                  className={`matrix-btn ${talkbackMatrix[channel.id] ? "on" : ""}`}
                  onClick={() =>
                    setTalkbackMatrix((prev) => ({
                      ...prev,
                      [channel.id]: !prev[channel.id],
                    }))
                  }
                >
                  <span>{channel.label}</span>
                  <span className={`mic-indicator ${micActive[channel.id] ? "active" : ""}`}>
                    MIC ACTIVE
                  </span>
                </button>
              ))}

              <button
                className={`matrix-btn master-call ${masterCall ? "on" : ""}`}
                onClick={() => setMasterCall((prev) => !prev)}
              >
                <span>MASTER CALL</span>
                <span className={`mic-indicator ${masterCall ? "active" : ""}`}>BROADCAST</span>
              </button>
            </div>
          </article>

          <article className="hub-panel">
            <h2 className="pane-title">Audio Mixer</h2>
            <div className="fader-grid">
              <Fader label="NDI In 1" value={ndiInput1} onChange={setNdiInput1} />
              <Fader label="NDI In 2" value={ndiInput2} onChange={setNdiInput2} />
              <Fader label="NDI In 3" value={ndiInput3} onChange={setNdiInput3} />
              <Fader label="Talkback Vol" value={talkbackVolume} onChange={setTalkbackVolume} />
              <Fader label="Master Out" value={masterProgramOut} onChange={setMasterProgramOut} />
            </div>
          </article>
        </section>
      </section>
    </main>
  );
}

function Fader({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="fader-col">
      <span className="technical-label">{label}</span>
      <div className="fader-track">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="fader-input"
          aria-label={label}
        />
      </div>
      <span className="fader-db">{value}%</span>
    </div>
  );
}
