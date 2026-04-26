"use client";

import React, { useEffect, useMemo, useState } from "react";

type CameraBox = {
  id: string;
  label: string;
};

const CAMERA_BOXES: CameraBox[] = [
  { id: "cam1", label: "Cam 1" },
  { id: "cam2", label: "Cam 2" },
  { id: "cam3", label: "Cam 3" },
];

const WS_URL = "ws://localhost:9000/ws";

export default function DashboardPage() {
  const [connected, setConnected] = useState(false);
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set());

  useEffect(() => {
    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      setConnected(true);
    };

    socket.onclose = () => {
      setConnected(false);
    };

    socket.onerror = () => {
      setConnected(false);
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as {
          sources?: string[];
        };

        if (Array.isArray(payload.sources)) {
          setActiveSources(new Set(payload.sources.map((source) => source.toLowerCase())));
        }
      } catch {
        // Ignore non-JSON payloads from the Vision service.
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  const cameraState = useMemo(
    () =>
      CAMERA_BOXES.map((camera) => {
        const isDetected = activeSources.has(camera.label.toLowerCase());
        return { ...camera, isDetected };
      }),
    [activeSources]
  );

  return (
    <main className="dashboard">
      <header className="header">
        <h1>Junction Core Dashboard</h1>
        <span className={`status ${connected ? "online" : "offline"}`}>
          {connected ? "Vision Service Connected" : "Vision Service Offline"}
        </span>
      </header>

      <section className="grid">
        {cameraState.map((camera) => (
          <article key={camera.id} className={`camera-box ${camera.isDetected ? "detected" : ""}`}>
            <h2>{camera.label}</h2>
            <p>{camera.isDetected ? "NDI Source Detected" : "Waiting for NDI Source"}</p>
          </article>
        ))}
      </section>

      <style jsx>{`
        .dashboard {
          min-height: 100vh;
          margin: 0;
          padding: 2rem;
          background: #090c12;
          color: #f2f6ff;
          font-family: Inter, Arial, sans-serif;
        }

        .header {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .header h1 {
          margin: 0;
          font-size: 1.6rem;
          letter-spacing: 0.03em;
        }

        .status {
          border: 1px solid #4f5669;
          border-radius: 999px;
          padding: 0.35rem 0.8rem;
          font-size: 0.85rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .status.online {
          border-color: #00b7ff;
          color: #00d2ff;
        }

        .status.offline {
          border-color: #8d2438;
          color: #ff5f7c;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(180px, 1fr));
          gap: 1rem;
        }

        .camera-box {
          border: 2px solid #394154;
          border-radius: 16px;
          background: #0f1420;
          min-height: 180px;
          padding: 1rem;
          transition: box-shadow 220ms ease, border-color 220ms ease, transform 220ms ease;
        }

        .camera-box h2 {
          margin-top: 0;
          margin-bottom: 0.45rem;
          color: #f9fbff;
        }

        .camera-box p {
          margin: 0;
          color: #b0bdd3;
          font-size: 0.95rem;
        }

        .camera-box.detected {
          border-color: #00b7ff;
          box-shadow: 0 0 20px rgba(0, 183, 255, 0.55), 0 0 45px rgba(0, 183, 255, 0.3);
          transform: translateY(-2px);
        }

        @media (max-width: 980px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
