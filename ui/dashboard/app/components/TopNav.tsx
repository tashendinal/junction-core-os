"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { getOperatorProfile } from "../../lib/controlApi";
import { BrandMark } from "./BrandMark";
import { NavGlyph, type NavGlyphId } from "./NavGlyph";

const NAV_ITEMS: { href: string; label: string; glyph: NavGlyphId }[] = [
  { href: "/", label: "Switcher", glyph: "switcher" },
  { href: "/multiview", label: "Multiview", glyph: "multiview" },
  { href: "/graphics", label: "Graphics", glyph: "graphics" },
  { href: "/video-outputs", label: "Video outs", glyph: "outputs" },
  { href: "/tally-controllers", label: "Tally", glyph: "tally" },
  { href: "/camera-control", label: "Cam control", glyph: "camera" },
  { href: "/talkback", label: "Comms", glyph: "mic" },
  { href: "/system-health", label: "Storage / stream", glyph: "activity" },
  { href: "/server-control", label: "Server", glyph: "server" },
  { href: "/server-rack", label: "Rack", glyph: "rack" },
  { href: "/recording-rack", label: "Record", glyph: "record" },
  { href: "/gpu-modules", label: "GPU", glyph: "gpu" },
  { href: "/overlay-modules", label: "GFX", glyph: "gfx" },
  { href: "/fiber-link", label: "Fiber", glyph: "fiber" },
  { href: "/link-balancer", label: "Load balancer", glyph: "balancer" },
  { href: "/noc", label: "NOC", glyph: "noc" },
  { href: "/mcr", label: "MCR", glyph: "mcr" },
  { href: "/on-air", label: "On air", glyph: "onair" },
  { href: "/readiness", label: "Readiness", glyph: "readiness" },
  { href: "/operations", label: "Operations", glyph: "operations" },
  { href: "/backup", label: "Backup", glyph: "backup" },
  { href: "/users", label: "Users", glyph: "users" },
];

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [modeLabel, setModeLabel] = React.useState<string>("MULTI");

  React.useEffect(() => {
    let mounted = true;
    void getOperatorProfile()
      .then((profile) => {
        if (!mounted || !profile) return;
        const mode = profile.operatorProfileMode === "single_vendor_operator" ? "SINGLE" : "MULTI";
        setModeLabel(mode);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [pathname]);

  return (
    <nav className="top-nav tactile-node" aria-label="Primary">
      <div className="nav-brand-cluster">
        <BrandMark variant="compact" size={30} className="nav-brand-glyph" />
        <div className="nav-brand-copy">
          <span className="nav-brand-name">Junction Core</span>
          <span className="nav-brand-meta">
            <span className="nav-brand-tag">Control</span>
            <span className="nav-brand-dot" aria-hidden />
            <span>Profile {modeLabel}</span>
          </span>
        </div>
      </div>
      <div className="top-nav-tabs top-nav-tabs-four" role="tablist">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.href}
            type="button"
            role="tab"
            aria-selected={pathname === item.href}
            className={`top-tab ${pathname === item.href ? "active" : ""}`}
            onClick={() => router.push(item.href)}
          >
            <NavGlyph id={item.glyph} className="top-tab-icon" />
            <span className="top-tab-label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
