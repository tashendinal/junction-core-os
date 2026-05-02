"use client";

import React, { useCallback, useState } from "react";

type BrandMarkProps = {
  className?: string;
  size?: number;
  variant?: "default" | "compact";
};

const ACCENT = "#00d4ff";
const ACCENT_DEEP = "#00a8c7";

const LOGO_SRC = (process.env.NEXT_PUBLIC_BRAND_LOGO || "/brand/logo.png").trim();
const HIDE_WORDMARK =
  process.env.NEXT_PUBLIC_BRAND_LOGO_HIDE_WORDMARK === "1" ||
  process.env.NEXT_PUBLIC_BRAND_LOGO_HIDE_WORDMARK === "true";

/** Cyan rounded badge + white junction cross (fallback when PNG missing). */
function BadgeGlyph({ size, className = "" }: { size: number; className?: string }) {
  const vb = 40;
  const uid = React.useId().replace(/:/g, "");
  const gradId = `jc-brand-shine-${uid}`;
  const filterId = `jc-brand-tip-${uid}`;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${vb} ${vb}`}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.22} />
          <stop offset="45%" stopColor={ACCENT_DEEP} stopOpacity={0} />
        </linearGradient>
        <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x="3" y="3" width="34" height="34" rx="8" fill={ACCENT} />
      <rect x="3" y="3" width="34" height="34" rx="8" fill={`url(#${gradId})`} opacity={0.35} />
      <path
        d="M20 11v18M11 20h18"
        fill="none"
        stroke="#f8fafc"
        strokeWidth={2.85}
        strokeLinecap="round"
      />
      <g filter={`url(#${filterId})`}>
        <circle cx="20" cy="11" r="1.85" fill="#b8f9ff" />
        <circle cx="20" cy="29" r="1.85" fill="#b8f9ff" />
        <circle cx="11" cy="20" r="1.85" fill="#b8f9ff" />
        <circle cx="29" cy="20" r="1.85" fill="#b8f9ff" />
      </g>
    </svg>
  );
}

function BrandLogoImg({
  variant,
  size,
  className,
  onFallback,
}: {
  variant: "default" | "compact";
  size: number;
  className?: string;
  onFallback: () => void;
}) {
  const compact = variant === "compact";
  const handleError = useCallback(() => {
    onFallback();
  }, [onFallback]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- operator-supplied PNG; aspect ratio varies
    <img
      src={LOGO_SRC}
      alt=""
      decoding="async"
      className={`brand-mark-img ${compact ? "brand-mark-img--compact" : "brand-mark-img--hero"} ${className ?? ""}`.trim()}
      onError={handleError}
    />
  );
}

/** Wordmark + logo: uses PNG at NEXT_PUBLIC_BRAND_LOGO or /brand/logo.png when present; otherwise SVG badge. */
export function BrandMark({ className = "", size = 32, variant = "default" }: BrandMarkProps) {
  const [useSvg, setUseSvg] = useState(LOGO_SRC.length === 0);
  const onFallback = useCallback(() => setUseSvg(true), []);

  if (useSvg) {
    if (variant === "compact") {
      return <BadgeGlyph size={size} className={className} />;
    }
    const badgeSize = Math.round(size * 1.35);
    return (
      <div className={`brand-mark brand-mark--hero ${className}`.trim()} aria-label="Junction Core">
        <BadgeGlyph size={badgeSize} className="brand-mark-badge" />
        <div className="brand-mark-text">
          <span className="brand-mark-title">Junction Core</span>
          <span className="brand-mark-sub">Broadcast control surface</span>
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={`brand-mark brand-mark--compact ${className}`.trim()} aria-label="Junction Core">
        <BrandLogoImg variant="compact" size={size} onFallback={onFallback} />
      </div>
    );
  }

  return (
    <div className={`brand-mark brand-mark--hero ${className}`.trim()} aria-label="Junction Core">
      <BrandLogoImg variant="default" size={size} onFallback={onFallback} />
      {!HIDE_WORDMARK ? (
        <div className="brand-mark-text">
          <span className="brand-mark-title">Junction Core</span>
          <span className="brand-mark-sub">Broadcast control surface</span>
        </div>
      ) : null}
    </div>
  );
}
