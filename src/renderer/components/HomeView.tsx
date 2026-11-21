// v10.0.0 — HomeView: the MERGED home.
//
// The strongest signal that Games and Entertainment are one app now: your
// games' "Continue Playing" rail sits directly above the cinematic media home.
// Both are Forge panels, so the user can rearrange them the moment Forge Mode
// is unlocked.

import type { Game } from "@shared/types";
import { Icon } from "./Icons";
import { PlatformMark } from "./PlatformMark";
import { formatPlaytimeShort, gradientFor, initials, relativeTime } from "../lib/helpers";
import { ForgePanel } from "../forge/Workspace";
import type { TmdbItem, TmdbMediaType } from "../lib/tmdb-types";

export interface HomeViewProps {
  /** Games with play history, newest first. */
  recentGames: Game[];
  onLaunchGame: (g: Game) => void;
  onOpenGame: (id: number) => void;
  /** The full media home (hero + rails), already wired by the shell. */
  mediaHome: React.ReactNode;
  /** Stats for the header chip. */
  totalGames: number;
  onGoGames: () => void;
}

export function HomeView({ recentGames, onLaunchGame, onOpenGame, mediaHome, totalGames, onGoGames }: HomeViewProps) {
  const resumeGames = recentGames.filter((g) => g.lastPlayedAt).slice(0, 8);

  return (
    <div className="nx-home">
      {/* ── Games: Continue Playing ── */}
      <ForgePanel type="games-resume" title="Continue Playing" minW={280} minH={140}>
        <section className="nx-home-games" aria-label="Continue playing games">
          <div className="nx-home-games-head">
            <div className="nx-home-games-title">
              <Icon.Gamepad size={15} />
              <span>Continue Playing</span>
              <em>{totalGames} game{totalGames === 1 ? "" : "s"} in your library</em>
            </div>
            <button className="nx-home-games-all" onClick={onGoGames}>
              All games <Icon.Chevron size={12} />
            </button>
          </div>

          {resumeGames.length > 0 ? (
            <div className="nx-home-games-rail">
              {resumeGames.map((g) => {
                const banner = g.coverImage || g.bannerImage;
                const grad = gradientFor(g.title);
                return (
                  <button key={g.id} className="nx-resume-card" onClick={() => onLaunchGame(g)} title={`Play ${g.title}`}>
                    <span className="nx-resume-cover">
                      {banner ? (
                        <img src={banner} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <span className="nx-resume-initials" style={{ background: `radial-gradient(120% 120% at 20% 0%, ${grad.from} 0%, ${grad.to} 70%, #050505 100%)` }}>{initials(g.title)}</span>
                      )}
                      <span className="nx-resume-play"><Icon.Play size={15} /></span>
                    </span>
                    <span className="nx-resume-meta">
                      <span className="nx-resume-title">{g.title}</span>
                      <span className="nx-resume-sub">
                        <span className="nx-resume-plat"><PlatformMark platform={g.platform} size={10} /></span>
                        {g.playtimeSec > 0 ? formatPlaytimeShort(g.playtimeSec) : "New"}
                        <span className="nx-resume-dot">·</span>
                        {relativeTime(g.lastPlayedAt)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="nx-home-games-empty">
              <Icon.Gamepad size={22} />
              <p>No game sessions yet — launch something from your library.</p>
              <button className="nx-home-games-all" onClick={onGoGames}>Open Games</button>
            </div>
          )}
        </section>
      </ForgePanel>

      {/* ── Media: the cinematic home ── */}
      <ForgePanel type="media-home" title="Entertainment Home" minW={320} minH={240}>
        {mediaHome}
      </ForgePanel>
    </div>
  );
}
