"use client";

import React, { useEffect, useState } from "react";

const WS_URL =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_VISION_WS_URL
    ? process.env.NEXT_PUBLIC_VISION_WS_URL
    : "ws://localhost:9000/ws";

type ThermalAlert = {
  message: string;
  max_c?: number;
};

export function ThermalAlertBanner() {
  const [alert, setAlert] = useState<ThermalAlert | null>(null);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as Record<string, unknown>;
        if (payload.type === "thermal_alert") {
          const msg = typeof payload.message === "string" ? payload.message : "High Temp";
          const max_c = typeof payload.max_c === "number" ? payload.max_c : undefined;
          setAlert({ message: msg, max_c });
        } else if (payload.type === "thermal_clear") {
          setAlert(null);
        }
      } catch {
        /* ignore */
      }
    };
    return () => socket.close();
  }, []);

  if (!alert) return null;

  return (
    <div className="thermal-alert-banner" role="alert">
      <span className="thermal-alert-title">High Temp</span>
      <span className="thermal-alert-body">
        {alert.message}
        {alert.max_c != null ? ` · peak ${alert.max_c}°C` : ""}
      </span>
    </div>
  );
}
