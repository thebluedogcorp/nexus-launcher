import type { Game } from "@shared/types";
import { CoverArt } from "./CoverArt";
import { formatPlaytimeShort, relativeTime, platformLabel, platformColor } from "../lib/helpers";

interface Props {
  game: Game;
  index: number;
  onOpen: (id: number) => void;
  onToggleFav: (game: Game) => void;
  onLaunch: (game: Game) => void;
}

export function GameCard({ game, index, onOpen, onToggleFav, onLaunch }: Props) {
  return (
    <div
      className="game-card"
      style={{ animationDelay: `${Math.min(index * 25, 400)}ms` }}
      onClick={() => onOpen(game.id)}
    >
      <CoverArt title={game.title} platform={game.platform} coverImage={game.coverImage} />

      <div className="chip-row">
        <span className={game.source === "auto" ? "chip auto" : "chip manual"}>
          {game.source === "auto" ? "Detected" : "Manual"}
        </span>
        <button
          className={game.favorite ? "fav-btn on" : "fav-btn"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav(game);
          }}
          title={game.favorite ? "Remove favorite" : "Add favorite"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={game.favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      </div>

      <div className="play-btn">
        <button
          className="circle"
          onClick={(e) => {
            e.stopPropagation();
            onLaunch(game);
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6 4 20 12 6 20 6 4" />
          </svg>
        </button>
      </div>

      <div className="card-meta">
        <div className="card-title">{game.title}</div>
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
          <div className="card-sub" style={{ marginTop: 2, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
            Played {relativeTime(game.lastPlayedAt)}
          </div>
        )}
      </div>
    </div>
  );
}
