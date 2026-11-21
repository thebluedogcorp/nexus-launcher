// v9.4.0 — ModeSplash. The first screen users see when NEXUS opens.
// Two choices: Games (the game launcher) or Media Server (stream your own
// local video library + host it on your LAN).
//
// Redesigned in v9.4.0 — the old TMDB "Entertainment / NEXUS TV" mode is
// gone. The second mode is now the local media server: browse, play, and
// share the files already on your machine. No third-party stream hosts.

import { Icon } from "./Icons";
import { NexusMark } from "./Logo";

export type NexusMode = "games" | "media";

interface Props {
  onChoose: (mode: NexusMode) => void;
}

export function ModeSplash({ onChoose }: Props) {
  return (
    <div className="splash-root">
      <div className="splash-bg" />
      <div className="splash-glow glow-a" />
      <div className="splash-glow glow-b" />
      <div className="splash-grid" />

      <div className="splash-content">
        {/* Brand */}
        <div className="splash-brand">
          <span className="splash-mark"><NexusMark size={36} /></span>
          <p className="splash-eyebrow">Start Here</p>
          <h1 className="splash-title">Games &amp; Media Server</h1>
          <p className="splash-sub">Pick a mode to continue · switch anytime from the top bar</p>
        </div>

        {/* Mode cards */}
        <div className="splash-cards">
          {/* GAMES */}
          <button className="splash-card games" onClick={() => onChoose("games")} autoFocus>
            <div className="splash-card-glow" />
            <div className="splash-card-eyebrow">Mode 01</div>
            <div className="splash-card-icon games"><Icon.Gamepad size={40} /></div>
            <div className="splash-card-name">Games</div>
            <div className="splash-card-desc">
              Your game launcher — auto-detects every installed game across
              Steam, Epic, GOG, Battle.net, EA, Ubisoft, Riot and Xbox. Rich
              metadata, collections, playtime, stats, one-click launch.
            </div>
            <ul className="splash-card-feats">
              <li><span className="dot games" />Library &amp; platforms</li>
              <li><span className="dot games" />RAWG metadata</li>
              <li><span className="dot games" />Stats &amp; themes</li>
              <li><span className="dot games" />Plugin system</li>
            </ul>
            <div className="splash-card-cta">
              Launch Game Library <Icon.Chevron size={14} />
            </div>
          </button>

          {/* MEDIA SERVER */}
          <button className="splash-card tv" onClick={() => onChoose("media")}>
            <div className="splash-card-glow" />
            <div className="splash-card-eyebrow">Mode 02</div>
            <div className="splash-card-icon tv"><Icon.Film size={40} /></div>
            <div className="splash-card-name">Media Server</div>
            <div className="splash-card-desc">
              Stream your own video files — movies, shows, clips, anything on
              your disk. Scan your folders, play in-app with seeking, and host
              your library for other devices on your local network.
            </div>
            <ul className="splash-card-feats">
              <li><span className="dot tv" />Your own files only</li>
              <li><span className="dot tv" />Scan + instant playback</li>
              <li><span className="dot tv" />QR / invite-code LAN sharing</li>
              <li><span className="dot tv" />No cloud · no upload</li>
            </ul>
            <div className="splash-card-cta">
              Open Media Server <Icon.Chevron size={14} />
            </div>
          </button>
        </div>

        {/* Quick info */}
        <div className="splash-info">
          <span><Icon.HardDrive size={12} /> Streams your local files</span>
          <span><Icon.Gamepad size={12} /> RAWG-powered game metadata</span>
          <span><Icon.Shield size={12} /> No piracy · no telemetry</span>
        </div>

        {/* Footer */}
        <div className="splash-foot">
          <span className="splash-foot-mark"><NexusMark size={12} /></span>
          <strong>NEXUS</strong> Universal Launcher · <span className="dim">v9.4.0</span>
          <span className="splash-foot-sep">·</span>
          <span className="dim">Press a card to continue</span>
        </div>
      </div>
    </div>
  );
}
