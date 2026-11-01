// v5.0.0 — ModeSplash. The first screen users see when NEXUS opens.
// Two choices: Games (the game launcher) or Entertainment (NEXUS TV —
// an OTT-style movie + TV experience powered by TMDB).
//
// On mount it pulls trending movies+TV so the backdrop is a cinematic collage.

import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import { NexusMark } from "./Logo";
import { asItems, tmdbImg, type TmdbItem } from "../lib/tmdb-types";

export type NexusMode = "games" | "tv";

interface Props {
  onChoose: (mode: NexusMode) => void;
}

export function ModeSplash({ onChoose }: Props) {
  const [collage, setCollage] = useState<TmdbItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await window.nexus.tmdbTrendingAll();
      if (cancelled) return;
      setCollage(asItems(r).filter(i => i.backdropPath).slice(0, 6));
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="splash-root">
      {/* Ambient cinematic collage */}
      <div className="splash-collage">
        {collage.length > 0 ? (
          collage.map((item, i) => (
            <div key={item.id} className={i % 2 === 0 ? "splash-collage-cell tall" : "splash-collage-cell"}>
              <img src={tmdbImg(item.backdropPath, "w780")} alt="" />
            </div>
          ))
        ) : (
          <div className="splash-collage-fallback" />
        )}
      </div>
      <div className="splash-bg" />
      <div className="splash-glow glow-a" />
      <div className="splash-glow glow-b" />
      <div className="splash-grid" />

      <div className="splash-content">
        {/* Brand */}
        <div className="splash-brand">
          <span className="splash-mark"><NexusMark size={36} /></span>
          <p className="splash-eyebrow">Start Here</p>
          <h1 className="splash-title">Games &amp; Entertainment</h1>
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
              Your game launcher — library, collections, playtime tracking,
              achievements, stats, and one-click launch across every platform.
            </div>
            <ul className="splash-card-feats">
              <li><span className="dot games" />Library &amp; platforms</li>
              <li><span className="dot games" />Store &amp; downloads</li>
              <li><span className="dot games" />Stats &amp; themes</li>
              <li><span className="dot games" />Plugin system</li>
            </ul>
            <div className="splash-card-cta">
              Launch Game Library <Icon.Chevron size={14} />
            </div>
          </button>

          {/* ENTERTAINMENT */}
          <button className="splash-card tv" onClick={() => onChoose("tv")}>
            <div className="splash-card-glow" />
            <div className="splash-card-eyebrow">Mode 02</div>
            <div className="splash-card-icon tv"><Icon.Film size={40} /></div>
            <div className="splash-card-name">Entertainment</div>
            <div className="splash-card-desc">
              NEXUS TV — browse trending, popular, and top-rated movies &amp;
              series. Watch full films &amp; episodes instantly, explore cast
              + credits, and find where to stream.
            </div>
            <ul className="splash-card-feats">
              <li><span className="dot tv" />Full streaming playback</li>
              <li><span className="dot tv" />Trending &amp; popular</li>
              <li><span className="dot tv" />Top rated &amp; search</li>
              <li><span className="dot tv" />Trailers + cast</li>
            </ul>
            {collage.length > 0 && (
              <div className="splash-card-preview">
                {collage.slice(0, 5).map(c => (
                  <div key={c.id} className="splash-card-preview-poster">
                    {c.posterPath && <img src={tmdbImg(c.posterPath, "w185")} alt={c.title} />}
                  </div>
                ))}
              </div>
            )}
            <div className="splash-card-cta">
              Open NEXUS TV <Icon.Chevron size={14} />
            </div>
          </button>
        </div>

        {/* Quick info */}
        <div className="splash-info">
          <span><Icon.Film size={12} /> TMDB-powered catalog</span>
          <span><Icon.Gamepad size={12} /> RAWG-powered game metadata</span>
          <span><Icon.Shield size={12} /> Read-only · no telemetry</span>
        </div>

        {/* Footer */}
        <div className="splash-foot">
          <span className="splash-foot-mark"><NexusMark size={12} /></span>
          <strong>NEXUS</strong> Universal Launcher · <span className="dim">v5.0.0</span>
          <span className="splash-foot-sep">·</span>
          <span className="dim">Press a card to continue</span>
        </div>
      </div>
    </div>
  );
}
