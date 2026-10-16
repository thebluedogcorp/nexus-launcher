// v1.0 — PlatformMark: original geometric SVG marks for each game platform.
//
// Each mark is a STYLIZED monogram/emblem interpretation — not a trademarked
// bitmap logo — rendered as a single-color SVG (path or text). They inherit
// color via the `color` prop (default `currentColor`) so the same component
// renders in the user's accent, white, or any context color. No gradients,
// no external assets — pure TypeScript + JSX.
//
// All marks use a 24×24 viewBox with ~2px optical padding.

import type { PlatformId } from "@shared/types";

export interface PlatformMarkProps {
  platform: PlatformId;
  size?: number;         // default 16
  color?: string;        // default "currentColor" — mark renders in this single color
  className?: string;
  title?: string;       // accessible label; defaults to the platform name.
                        // Pass `title=""` to opt out (renders as decorative, aria-hidden).
}

const PLATFORM_DEFAULT_TITLES: Record<PlatformId, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG Galaxy",
  xbox: "Xbox",
  ubisoft: "Ubisoft Connect",
  battlenet: "Battle.net",
  ea: "EA App",
  riot: "Riot Client",
  manual: "Manual",
  custom: "Custom",
};

function renderMark(platform: PlatformId): React.ReactNode {
  switch (platform) {
    case "steam": {
      // Two filled circles (big top-left, small bottom-right) joined by a
      // thick connecting "pipe" — the classic Steam valve/emblem silhouette.
      // The pipe is drawn first so the circle fills cover its ends, leaving
      // only the connecting bar visible between the two circles.
      return (
        <>
          <path d="M7.1 10.2 L16.1 17.2 L17.9 14.8 L8.9 7.8 Z" />
          <circle cx="8" cy="9" r="4.5" />
          <circle cx="17" cy="16" r="2.5" />
        </>
      );
    }
    case "epic": {
      // A bold geometric "E" inside a rounded-square frame.
      // Frame: stroked rounded rect. E: filled path with three even arms.
      return (
        <>
          <rect
            x="2.5"
            y="2.5"
            width="19"
            height="19"
            rx="3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M7 6 H17 V8.5 H9.5 V11.75 H14 V14.25 H9.5 V15.5 H17 V18 H7 Z" />
        </>
      );
    }
    case "gog": {
      // Rounded-square tile with the wordmark "GOG" rendered as crisp SVG text.
      return (
        <>
          <rect
            x="2.5"
            y="2.5"
            width="19"
            height="19"
            rx="4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <text
            x="12"
            y="12"
            fontFamily='Inter, "Segoe UI", system-ui, sans-serif'
            fontWeight="800"
            fontSize="7"
            textAnchor="middle"
            dominantBaseline="central"
            fill="currentColor"
          >
            GOG
          </text>
        </>
      );
    }
    case "xbox": {
      // A sphere outline with an "X" of two crossing diagonal strokes —
      // the Xbox emblem silhouette.
      return (
        <>
          <circle
            cx="12"
            cy="12"
            r="9.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M6 6 L18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M18 6 L6 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </>
      );
    }
    case "ubisoft": {
      // Stylized swirl — a spiral of growing semicircles approximating the
      // Ubisoft cyclone mark. Stroke-only, no fill.
      return (
        <path
          d="M12 12 a1.5 1.5 0 0 1 3 0 a3 3 0 0 1 -6 0 a4.5 4.5 0 0 1 9 0 a6 6 0 0 1 -12 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      );
    }
    case "battlenet": {
      // Bold geometric "B" — a vertical stem with two stacked right-bumps
      // (arcs) — the Battle.net letterform.
      return (
        <path d="M7 5 H14 A3.5 3 0 0 1 14 11 H9.5 V13 H14 A3.5 3 0 0 1 14 19 H7 Z" />
      );
    }
    case "ea": {
      // The "EA" monogram set inside a ring.
      return (
        <>
          <circle
            cx="12"
            cy="12"
            r="9.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <text
            x="12"
            y="12"
            fontFamily='Inter, "Segoe UI", system-ui, sans-serif'
            fontWeight="800"
            fontSize="6.5"
            textAnchor="middle"
            dominantBaseline="central"
            fill="currentColor"
          >
            EA
          </text>
        </>
      );
    }
    case "riot": {
      // Bold geometric "R" composed of three overlapping filled shapes:
      // a stem rectangle, a bowl with an outward arc, and a diagonal leg.
      return (
        <>
          <rect x="7" y="5" width="2.5" height="14" />
          <path d="M9.5 5 H15 A3 3 0 0 1 15 11 H9.5 Z" />
          <path d="M9.5 11 L12.5 11 L18 19 L15 19 Z" />
        </>
      );
    }
    case "manual": {
      // Classic OS cursor/pointer glyph with a small tail — denotes a
      // user-added (manually pointed-at) entry.
      return (
        <path d="M5 3 L5 17 L9 13.5 L11.5 19 L13.5 18 L11 12.5 L17 12.5 Z" />
      );
    }
    case "custom": {
      // A folder glyph — the universal "user-organized bucket" emblem.
      return (
        <path d="M3 7 L8 7 L10 9 L21 9 A1.5 1.5 0 0 1 22.5 10.5 L22.5 17.5 A1.5 1.5 0 0 1 21 19 L3 19 A1.5 1.5 0 0 1 1.5 17.5 L1.5 8.5 A1.5 1.5 0 0 1 3 7 Z" />
      );
    }
    default:
      return null;
  }
}

export function PlatformMark({
  platform,
  size = 16,
  color = "currentColor",
  className,
  title,
}: PlatformMarkProps) {
  // `title === ""` is the explicit "decorative" opt-out.
  // Otherwise the resolved title is the user-provided string or the
  // platform default name.
  const isDecorative = title === "";
  const resolvedTitle = title ?? PLATFORM_DEFAULT_TITLES[platform];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      // Setting CSS `color` makes `currentColor` on child <stroke>/<text>
      // fills resolve to the same `color` prop value.
      style={{ color }}
      className={className}
      role={isDecorative ? undefined : "img"}
      aria-hidden={isDecorative ? "true" : undefined}
      focusable="false"
    >
      {isDecorative ? null : <title>{resolvedTitle}</title>}
      {renderMark(platform)}
    </svg>
  );
}

export default PlatformMark;
