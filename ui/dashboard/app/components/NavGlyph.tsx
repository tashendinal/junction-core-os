import React from "react";

export type NavGlyphId =
  | "switcher"
  | "multiview"
  | "outputs"
  | "tally"
  | "camera"
  | "mic"
  | "activity"
  | "server"
  | "rack"
  | "record"
  | "gpu"
  | "gfx"
  | "graphics"
  | "fiber"
  | "balancer"
  | "noc"
  | "mcr"
  | "onair"
  | "readiness"
  | "operations"
  | "backup"
  | "users";

const S = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24" as const,
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeWidth: 1.65,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

type Props = { id: NavGlyphId; className?: string };

export function NavGlyph({ id, className }: Props) {
  switch (id) {
    case "switcher":
      return (
        <svg {...S} className={className} aria-hidden>
          <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h4M9 8h4M17 16h4" />
        </svg>
      );
    case "multiview":
      return (
        <svg {...S} className={className} aria-hidden>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "outputs":
      return (
        <svg {...S} className={className} aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M8 10h8M12 8v8" />
          <circle cx="18" cy="8" r="2" fill="currentColor" stroke="none" opacity={0.85} />
        </svg>
      );
    case "tally":
      return (
        <svg {...S} className={className} aria-hidden>
          <rect x="4" y="9" width="16" height="8" rx="1.5" opacity={0.35} />
          <circle cx="9" cy="13" r="2.25" fill="currentColor" stroke="none" />
          <circle cx="15" cy="13" r="2.25" />
          <circle cx="12" cy="5.5" r="1.75" />
        </svg>
      );
    case "camera":
      return (
        <svg {...S} className={className} aria-hidden>
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
      );
    case "mic":
      return (
        <svg {...S} className={className} aria-hidden>
          <path d="M12 19v3M8 22h8M12 15a4 4 0 0 0 4-4V6a4 4 0 0 0-8 0v5a4 4 0 0 0 4 4z" />
        </svg>
      );
    case "activity":
      return (
        <svg {...S} className={className} aria-hidden>
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      );
    case "server":
      return (
        <svg {...S} className={className} aria-hidden>
          <rect x="4" y="4" width="16" height="5" rx="1" />
          <rect x="4" y="15" width="16" height="5" rx="1" />
          <path d="M8 9v2M8 20v2M16 9v2M16 20v2" />
        </svg>
      );
    case "rack":
      return (
        <svg {...S} className={className} aria-hidden>
          <rect x="5" y="3" width="14" height="18" rx="1" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      );
    case "record":
      return (
        <svg {...S} className={className} aria-hidden>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        </svg>
      );
    case "gpu":
      return (
        <svg {...S} className={className} aria-hidden>
          <rect x="4" y="6" width="16" height="12" rx="1" />
          <path d="M8 10h2v4H8zM11 10h2v4h-2zM14 10h2v4h-2z" />
        </svg>
      );
    case "gfx":
      return (
        <svg {...S} className={className} aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 15h18M9 3v18" />
        </svg>
      );
    case "graphics":
      return (
        <svg {...S} className={className} aria-hidden>
          <rect x="4" y="5" width="16" height="5" rx="1" />
          <rect x="4" y="12" width="16" height="4" rx="1" opacity={0.85} />
          <rect x="4" y="18" width="10" height="3" rx="1" opacity={0.65} />
        </svg>
      );
    case "fiber":
      return (
        <svg {...S} className={className} aria-hidden>
          <path d="M8 3v18M16 3v18M4 8h4M16 8h4M4 16h4M16 16h4" />
        </svg>
      );
    case "balancer":
      return (
        <svg {...S} className={className} aria-hidden>
          <path d="M12 3v18M5 8h14M5 16h14" />
          <circle cx="8" cy="8" r="2" />
          <circle cx="16" cy="16" r="2" />
        </svg>
      );
    case "noc":
      return (
        <svg {...S} className={className} aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l4 2" />
        </svg>
      );
    case "mcr":
      return (
        <svg {...S} className={className} aria-hidden>
          <path d="M4 10v10M8 6v14M12 3v17M16 8v12M20 12v8" />
        </svg>
      );
    case "onair":
      return (
        <svg {...S} className={className} aria-hidden>
          <path d="M4.5 16.5c4.5-6 10.5-6 15 0" />
          <circle cx="5" cy="16" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="19" cy="16" r="1.5" fill="currentColor" stroke="none" />
          <path d="M9 12h6" />
        </svg>
      );
    case "readiness":
      return (
        <svg {...S} className={className} aria-hidden>
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case "operations":
      return (
        <svg {...S} className={className} aria-hidden>
          <path d="M16 4h2a2 2 0 0 1 2 2v2M8 4H6a2 2 0 0 0-2 2v2M16 20h2a2 2 0 0 0 2-2v-2M8 20H6a2 2 0 0 1-2-2v-2" />
          <path d="M12 8v4l3 3" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "backup":
      return (
        <svg {...S} className={className} aria-hidden>
          <ellipse cx="12" cy="6" rx="8" ry="3" />
          <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </svg>
      );
    case "users":
      return (
        <svg {...S} className={className} aria-hidden>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    default:
      return <svg {...S} className={className} aria-hidden><circle cx="12" cy="12" r="2" /></svg>;
  }
}
