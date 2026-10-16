// v4.4.0 — PreviewCanvas. A scaled, non-interactive miniature of the real
// launcher (topbar + sidebar + game grid) rendered inside the Theme Studio.
// It reuses the REAL launcher's CSS classes (.topbar, .dt-sidebar, .gc, …)
// so it reflects the live draft theme instantly (the draft is applied to
// :root via applyTheme, which these classes consume). pointer-events:none
// so clicks pass through to the editor chrome.

import { NexusMark } from "../Logo";
import { PlatformMark } from "../PlatformMark";

const SAMPLE_TITLES = ["Eldritch Realm", "Neon Drift", "Skyforge", "Hollow Tide", "Velocity X", "Ashen Crown"];

function SampleCard({ i, title }: { i: number; title: string }) {
  const hue = (i * 47) % 360;
  return (
    <div className="gc" style={{ pointerEvents: "none" }}>
      <div className="gc-cover">
        <div className="gc-proc" style={{ background: `radial-gradient(120% 120% at 20% 0%, hsl(${hue},60%,28%) 0%, hsl(${hue + 30},50%,12%) 70%, #050505 100%)` }}>
          <span className="mono">{title.slice(0, 2).toUpperCase()}</span>
        </div>
        <div className="gc-overlay" />
        <div className="gc-chips">
          <span className="gc-platform"><span className="pm"><PlatformMark platform={(["steam","epic","gog","xbox","riot","ubisoft"] as const)[i % 6]} size={10} /></span>Platform</span>
          <span className="gc-fav"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15 8 22 9 17 14 18 21 12 17 6 21 7 14 2 9 9 8" /></svg></span>
        </div>
        <div className="gc-hover-play"><div className="gc-play-btn"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20" /></svg></div></div>
      </div>
      <div className="gc-footer">
        <div className="gc-title">{title}</div>
        <div className="gc-meta"><span>{i + 1}h</span><span className="v">Played {i}d ago</span></div>
      </div>
    </div>
  );
}

export function PreviewCanvas() {
  return (
    <div className="ts-preview">
      {/* The preview "device" frame */}
      <div className="ts-device">
        {/* Mini topbar — reuses the real .topbar class so it themes live */}
        <div className="ts-mini-topbar">
          <div className="ts-mini-brand"><NexusMark size={13} /><span>NEXUS</span></div>
          <div className="ts-mini-search"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg><span>Search library…</span></div>
          <div className="ts-mini-toggle"><span>Console</span><span className="on">Desktop</span></div>
          <div className="ts-mini-actions"><span>+</span><span>⚙</span></div>
        </div>
        <div className="ts-mini-body">
          {/* Mini sidebar */}
          <div className="ts-mini-sidebar">
            <div className="ts-mini-section">COLLECTIONS</div>
            <div className="ts-mini-nav active">All Games</div>
            <div className="ts-mini-nav">Favorites</div>
            <div className="ts-mini-nav">Recently Played</div>
            <div className="ts-mini-section">PLATFORMS</div>
            <div className="ts-mini-nav"><span className="pm"><PlatformMark platform="steam" size={11} /></span>Steam</div>
            <div className="ts-mini-nav"><span className="pm"><PlatformMark platform="epic" size={11} /></span>Epic</div>
            <div className="ts-mini-nav"><span className="pm"><PlatformMark platform="xbox" size={11} /></span>Xbox</div>
          </div>
          {/* Mini grid */}
          <div className="ts-mini-main">
            <div className="ts-mini-grid">
              {SAMPLE_TITLES.map((t, i) => <SampleCard key={t} i={i} title={t} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
