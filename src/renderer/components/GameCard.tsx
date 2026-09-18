import type { Game } from "@shared/types";
import { Icon } from "./Icons";
import {
  formatPlaytimeShort, relativeTime, platformLabel, platformColor, gradientFor, initials,
} from "../lib/helpers";

interface Props {
  game: Game;
  index: number;
  onOpen: (id: number) => void;
  onToggleFav: (game: Game) => void;
  onLaunch: (game: Game) => void;
}

/** Premium card: 16:9 banner image on top, metadata below. */
export function GameCard({ game, index, onOpen, onToggleFav, onLaunch }: Props) {
  const banner = game.bannerImage || game.coverImage;
  const grad = gradientFor(game.title);

  return (
    <div
      className="game-card"
      style={{ animationDelay: `${Math.min(index * 30, 450)}ms` }}
      onClick={() => onOpen(game.id)}
    >
      <div className="card-banner">
        {banner ? (
          <img src={banner} alt={game.title} loading="lazy" onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }} />
        ) : (
          <div
            className="card-proc"
            style={{
              background: `radial-gradient(120% 120% at 20% 0%, ${grad.from} 0%, ${grad.to} 70%, #050505 100%)`,
            }}
          >
            <div className="grid-lines" />
            <div className="blob" style={{ background: grad.accent }} />
            <span className="mono">{initials(game.title)}</span>
          </div>
        )}
        <div className="card-banner-overlay" />

        {/* Top chips */}
        <div className="card-chips">
          <span className={game.source === "auto" ? "chip auto" : "chip manual"}>
            {game.source === "auto" ? "Detected" : "Manual"}
          </span>
          <button
            className={game.favorite ? "fav-btn on" : "fav-btn"}
            onClick={(e) => { e.stopPropagation(); onToggleFav(game); }}
            title={game.favorite ? "Remove favorite" : "Add favorite"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={game.favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        </div>

        {/* Hover play */}
        <div className="card-hover">
          <button
            className="card-play-circle"
            onClick={(e) => { e.stopPropagation(); onLaunch(game); }}
            title={`Play ${game.title}`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 4 20 12 6 20 6 4" />
            </svg>
          </button>
        </div>
      </div>

      <div className="card-footer">
        <div className="card-title" title={game.title}>{game.title}</div>
        <div className="card-sub">
          <span className="plat">
            <span className="dot" style={{ background: platformColor(game.platform) }} />
            {platformLabel(game.platform)}
          </span>
          {game.playtimeSec > 0 ? (
            <span>{formatPlaytimeShort(game.playtimeSec)}</span>
          ) : (
            <span style={{ color: "rgba(255,255,255,0.25)" }}>New</span>
          )}
        </div>
        {game.lastPlayedAt && (
          <div className="card-sub" style={{ marginTop: 3, fontSize: 10, color: "rgba(255,255,255,0.28)" }}>
            Played {relativeTime(game.lastPlayedAt)}
          </div>
        )}
      </div>
    </div>
  );
}
