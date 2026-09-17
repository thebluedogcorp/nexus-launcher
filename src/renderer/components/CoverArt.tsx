import { gradientFor, initials, platformMonogram } from "../lib/helpers";
import type { PlatformId } from "@shared/types";

interface Props {
  title: string;
  platform: PlatformId;
  coverImage?: string | null;
  showOverlay?: boolean;
}

export function CoverArt({ title, platform, coverImage, showOverlay = true }: Props) {
  const grad = gradientFor(title);
  const mono = initials(title);

  if (coverImage) {
    return (
      <div className="cover" style={{ position: "relative" }}>
        <img src={coverImage} alt={title} onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }} />
        {showOverlay && <div className="cover-overlay" />}
        <div className="chip-row" style={{ pointerEvents: "none" }}>
          <span className="chip">{platformMonogram(platform)}</span>
          <span />
        </div>
      </div>
    );
  }

  return (
    <div className="cover">
      <div
        className="cover-proc"
        style={{
          background: `radial-gradient(120% 120% at 20% 0%, ${grad.from} 0%, ${grad.to} 70%, #050505 100%)`,
        }}
      >
        <div className="grid-lines" />
        <div className="blob" style={{ background: grad.accent }} />
        <span className="mono">{mono}</span>
      </div>
      {showOverlay && <div className="cover-overlay" />}
      <div className="chip-row" style={{ pointerEvents: "none" }}>
        <span className="chip">{platformMonogram(platform)}</span>
        <span />
      </div>
    </div>
  );
}
