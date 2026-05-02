"use client";

import { TopNav } from "../components/TopNav";
import React, { useMemo, useState } from "react";
import { getOperatorProfile, type OperatorProfile } from "../../lib/controlApi";

type ChannelId = "cam1" | "cam2" | "cam3";
const CHANNELS: { id: ChannelId; label: string }[] = [
  { id: "cam1", label: "CAM 1" },
  { id: "cam2", label: "CAM 2" },
  { id: "cam3", label: "CAM 3" },
];

export default function TalkbackAudioHubPage() {
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
  const [profile, setProfile] = useState<OperatorProfile>({
    operatorProfileMode: "multi_vendor_software_defined",
    singleVendorProfile: null,
  });

  React.useEffect(() => {
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
      <TopNav />
      <section className="tactile-node hub-shell">
        <header className="hub-header">
          <h1 className="pane-title">Talkback & Audio Hub</h1>
          <p className="technical-label">WiTalk-linked tactical communication matrix</p>
          <p className="technical-label">
            Profile:{" "}
            {profile.operatorProfileMode === "single_vendor_operator"
              ? `single-vendor (${profile.singleVendorProfile || "custom"})`
              : "multi-vendor software-defined"}
          </p>
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
