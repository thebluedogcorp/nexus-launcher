import { useEffect, useState } from "react";
import type { Game } from "@shared/types";
import { Icon } from "./Icons";
import {
  formatDate, formatPlaytime, formatSize, relativeTime, platformLabel, platformColor, gradientFor, initials,
} from "../lib/helpers";

interface Props {
  game: Game | null;
  onClose: () => void;
  onLaunch: (g: Game) => void;
  onPatch: (g: Game) => void;
  onDelete: (g: Game) => void;
  onToggleFav: (g: Game) => void;
}

/** Full-screen dedicated game page — cinematic banner, metadata grid, screenshots gallery. */
export function GamePage({ game, onClose, onLaunch, onPatch, onDelete, onToggleFav }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => { setConfirmDelete(false); setLightbox(null); setScrollY(0); }, [game?.id]);

  if (!game) return null;

  const banner = game.bannerImage || game.coverImage;
  const grad = gradientFor(game.title);

  // Parallax: the hero bg moves slower than the scroll.
  const heroTransform = `translateY(${scrollY * 0.4}px) scale(${1 + scrollY * 0.0003})`;

  return (
    <div
      className="game-page"
      onScroll={(e) => setScrollY((e.target as HTMLElement).scrollTop)}
    >
      <button className="gp-back" onClick={onClose} title="Back to library">
        <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.Chevron size={20} /></span>
      </button>

      {/* Cinematic hero */}
      <div className="gp-hero">
        <div
          className="gp-hero-bg"
          style={{
            backgroundImage: banner
              ? `url(${banner})`
              : `radial-gradient(circle at 30% 20%, ${grad.from}, #060608 70%)`,
            transform: heroTransform,
          }}
        />
        <div className="gp-hero-overlay" />
        <div className="gp-hero-content">
          <div className="gp-chips">
            <span className="chip" style={{ background: "rgba(0,0,0,0.55)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: platformColor(game.platform), display: "inline-block" }} />
              {platformLabel(game.platform)}
            </span>
            <span className={game.source === "auto" ? "chip auto" : "chip manual"}>
              {game.source === "auto" ? "Auto-detected" : "Manually added"}
            </span>
            {game.rating !== null && (
              <span className="chip gold"><Icon.Star size={11} filled /> {game.rating.toFixed(1)}</span>
            )}
            {game.favorite && <span className="chip auto"><Icon.Star size={11} filled /> Favorite</span>}
          </div>
          <h1 className="gp-title">{game.title}</h1>
          <div className="gp-meta">
            {game.developer && <span>{game.developer}</span>}
            {game.releaseDate && <><span className="dot" /><span>{formatDate(game.releaseDate)}</span></>}
            {game.playtimeSec > 0 && <><span className="dot" /><span>{formatPlaytime(game.playtimeSec)} played</span></>}
            {game.launchCount > 0 && <><span className="dot" /><span>{game.launchCount} launches</span></>}
            {game.sizeBytes && <><span className="dot" /><span>{formatSize(game.sizeBytes)}</span></>}
          </div>
          <div className="gp-actions">
            <button className="gp-play" onClick={() => onLaunch(game)}>
              <Icon.Play size={18} /> Play Now
            </button>
            <button className="btn btn-ghost" style={{ height: 52, padding: "0 24px", fontSize: 15 }} onClick={() => onPatch(game)}>
              <Icon.Refresh size={17} /> Patch Metadata
            </button>
            <button
              className={game.favorite ? "btn btn-outline" : "btn btn-ghost"}
              style={{ height: 52, width: 52, padding: 0, justifyContent: "center" }}
              onClick={() => onToggleFav(game)}
              title={game.favorite ? "Remove favorite" : "Add favorite"}
            >
              <Icon.Star size={18} filled={game.favorite} />
            </button>
          </div>
        </div>
      </div>

      <div className="gp-body">
        {/* Description */}
        <div className="gp-section-title"><span className="bar" /> About</div>
        {game.description ? (
          <p className="gp-desc" dangerouslySetInnerHTML={{ __html: stripHtml(game.description) }} />
        ) : (
          <div style={{ border: "1px dashed var(--nx-border)", background: "rgba(255,255,255,0.02)", borderRadius: 12, padding: 18, fontSize: 13, color: "var(--nx-text-faint)" }}>
            No description yet — click <strong style={{ color: "var(--nx-text-dim)" }}>Patch Metadata</strong> to fetch full details, screenshots, and cover art from RAWG + Steam.
          </div>
        )}

        {/* Genres */}
        {game.genres.length > 0 && (
          <>
            <div className="gp-section-title" style={{ marginTop: 32 }}><span className="bar" /> Genres</div>
            <div className="gp-genres">
              {game.genres.map((g) => <span key={g} className="genre-pill"><Icon.Tag size={12} /> {g}</span>)}
            </div>
          </>
        )}

        {/* Screenshots gallery */}
        {game.screenshots.length > 0 && (
          <>
            <div className="gp-section-title" style={{ marginTop: 32 }}><span className="bar" /> Screenshots</div>
            <div className="gp-shots">
              {game.screenshots.slice(0, 9).map((src, i) => (
                <div key={i} className="shot" onClick={() => setLightbox(src)}>
                  <img src={src} alt={`${game.title} ${i + 1}`} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = "none"; }} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Metadata grid */}
        <div className="gp-section-title" style={{ marginTop: 32 }}><span className="bar" /> Details</div>
        <div className="gp-meta-grid">
          <MetaRow icon={<Icon.Building size={15} />} label="Developer" value={game.developer} />
          <MetaRow icon={<Icon.Building size={15} />} label="Publisher" value={game.publisher} />
          <MetaRow icon={<Icon.Calendar size={15} />} label="Released" value={formatDate(game.releaseDate)} />
          <MetaRow icon={<Icon.Star size={15} />} label="Rating" value={game.rating !== null ? `${game.rating.toFixed(1)} / 5` : "—"} />
          <MetaRow icon={<Icon.Clock size={15} />} label="Playtime" value={formatPlaytime(game.playtimeSec)} />
          <MetaRow icon={<Icon.Play size={15} />} label="Launches" value={game.launchCount.toString()} />
        </div>

        {/* Install paths */}
        <div className="gp-section-title" style={{ marginTop: 32 }}><span className="bar" /> Install Info</div>
        <div className="gp-paths">
          <PathRow icon={<Icon.FileCog size={13} />} label="Executable" value={game.executable} />
          <PathRow icon={<Icon.Folder size={13} />} label="Install directory" value={game.installDir} />
          <PathRow icon={<Icon.HardDrive size={13} />} label="Size on disk" value={formatSize(game.sizeBytes)} />
          <PathRow icon={<Icon.Clock size={13} />} label="Last played" value={relativeTime(game.lastPlayedAt)} />
          <PathRow icon={<Icon.Calendar size={13} />} label="Added to library" value={formatDate(game.createdAt)} />
          {game.launchCommand && <PathRow icon={<Icon.ExternalLink size={13} />} label="Launch URI" value={game.launchCommand} />}
        </div>

        {/* Footer actions */}
        <div style={{ marginTop: 28, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {game.rawgId !== null && game.rawgId !== 0 && (
            <a href={`https://rawg.io/games/${game.rawgId}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              <Icon.ExternalLink size={14} /> View on RAWG
            </a>
          )}
          {!confirmDelete ? (
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              <Icon.Trash size={14} /> Remove from Library
            </button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => { onDelete(game); setConfirmDelete(false); }}>
                <Icon.Trash size={14} /> Confirm Removal
              </button>
            </>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <button className="modal-close lightbox-close" onClick={() => setLightbox(null)} style={{ background: "rgba(0,0,0,0.5)" }}>
            <Icon.Close size={20} />
          </button>
          <img src={lightbox} alt="Screenshot" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="meta-row" title={value ?? "—"}>
      <span className="icon">{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="label">{label}</div>
        <div className="value">{value || "—"}</div>
      </div>
    </div>
  );
}

function PathRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="path-row" title={value ?? "—"}>
      <span className="icon">{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="label">{label}</div>
        <div className="value">{value || "—"}</div>
      </div>
    </div>
  );
}

/** RAWG returns HTML in descriptions; strip tags but keep paragraph breaks. */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
