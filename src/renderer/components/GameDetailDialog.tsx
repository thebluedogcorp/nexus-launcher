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

export function GameDetailDialog({ game, onClose, onLaunch, onPatch, onDelete, onToggleFav }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => { setConfirmDelete(false); setLightbox(null); }, [game?.id]);
  if (!game) return null;

  const banner = game.bannerImage || game.coverImage;
  const grad = gradientFor(game.title);

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
          <div className="detail-banner">
            {banner ? (
              <img src={banner} alt={game.title} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <div className="cover-proc" style={{ background: `radial-gradient(120% 120% at 20% 0%, ${grad.from} 0%, ${grad.to} 70%, #050505 100%)` }}>
                <span style={{ fontSize: 64, fontWeight: 900, color: "rgba(255,255,255,0.85)" }}>{initials(game.title)}</span>
              </div>
            )}
            <div className="detail-banner-overlay" />
            <div className="detail-title-wrap">
              <div className="detail-chips">
                <span className="chip" style={{ background: "rgba(0,0,0,0.5)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: platformColor(game.platform), display: "inline-block" }} />
                  {platformLabel(game.platform)}
                </span>
                <span className={game.source === "auto" ? "chip auto" : "chip manual"}>
                  {game.source === "auto" ? "Auto-detected" : "Manually added"}
                </span>
                {game.rating !== null && (
                  <span className="chip gold">
                    <Icon.Star size={11} filled /> {game.rating.toFixed(1)}
                  </span>
                )}
              </div>
              <h2 className="detail-title">{game.title}</h2>
            </div>
            <button className="modal-close" onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(10px)" }}>
              <Icon.Close size={16} />
            </button>
          </div>

          <div className="detail-body">
            <div className="detail-actions">
              <button className="btn btn-primary" onClick={() => onLaunch(game)} style={{ height: 44, padding: "0 26px", fontSize: 14 }}>
                <Icon.Play size={16} /> Play Now
              </button>
              <button className="btn btn-ghost" onClick={() => onPatch(game)} style={{ height: 44 }}>
                <Icon.Refresh size={15} /> Patch Metadata
              </button>
              <button
                className={game.favorite ? "btn btn-outline" : "btn btn-ghost"}
                onClick={() => onToggleFav(game)}
                style={{ height: 44, width: 44, padding: 0, justifyContent: "center" }}
                title={game.favorite ? "Remove favorite" : "Add favorite"}
              >
                <Icon.Star size={16} filled={game.favorite} />
              </button>
            </div>

            {game.description ? (
              <p className="detail-desc">{game.description}</p>
            ) : (
              <div style={{ border: "1px dashed var(--nx-border)", background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: 13, fontSize: 12, color: "var(--nx-text-faint)" }}>
                No description yet — click <strong style={{ color: "var(--nx-text-dim)" }}>Patch Metadata</strong> to fetch details + screenshots from RAWG.
              </div>
            )}

            {/* Screenshots gallery */}
            {game.screenshots.length > 0 && (
              <div className="shots-gallery">
                {game.screenshots.slice(0, 6).map((src, i) => (
                  <div key={i} className="shot" onClick={() => setLightbox(src)}>
                    <img src={src} alt={`${game.title} screenshot ${i + 1}`} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = "none"; }} />
                  </div>
                ))}
              </div>
            )}

            {game.genres.length > 0 && (
              <div className="detail-genres">
                {game.genres.map((g) => (
                  <span key={g} className="genre-pill"><Icon.Tag size={11} /> {g}</span>
                ))}
              </div>
            )}

            <div className="detail-meta-grid">
              <MetaRow icon={<Icon.Building size={14} />} label="Developer" value={game.developer} />
              <MetaRow icon={<Icon.Building size={14} />} label="Publisher" value={game.publisher} />
              <MetaRow icon={<Icon.Calendar size={14} />} label="Released" value={formatDate(game.releaseDate)} />
              <MetaRow icon={<Icon.Star size={14} />} label="Rating" value={game.rating !== null ? `${game.rating.toFixed(1)} / 5` : "—"} />
              <MetaRow icon={<Icon.Clock size={14} />} label="Playtime" value={formatPlaytime(game.playtimeSec)} />
              <MetaRow icon={<Icon.Play size={14} />} label="Launches" value={game.launchCount.toString()} />
            </div>
          </div>

          <div className="detail-sidebar">
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--nx-text-faint)", marginBottom: 9 }}>
              Install Info
            </div>
            <PathRow icon={<Icon.FileCog size={13} />} label="Executable" value={game.executable} />
            <PathRow icon={<Icon.Folder size={13} />} label="Install dir" value={game.installDir} />
            <PathRow icon={<Icon.HardDrive size={13} />} label="Size" value={formatSize(game.sizeBytes)} />
            <PathRow icon={<Icon.Clock size={13} />} label="Last played" value={relativeTime(game.lastPlayedAt)} />
            <PathRow icon={<Icon.Calendar size={13} />} label="Added" value={formatDate(game.createdAt)} />
            {game.launchCommand && (
              <PathRow icon={<Icon.ExternalLink size={13} />} label="Launch URI" value={game.launchCommand} />
            )}

            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              {game.rawgId !== null && (
                <a href={`https://rawg.io/games/${game.rawgId}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }}>
                  <Icon.ExternalLink size={13} /> RAWG
                </a>
              )}
              {!confirmDelete ? (
                <button className="btn btn-danger btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={() => setConfirmDelete(true)}>
                  <Icon.Trash size={13} /> Remove
                </button>
              ) : (
                <>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={() => setConfirmDelete(false)}>Cancel</button>
                  <button className="btn btn-danger btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={() => { onDelete(game); setConfirmDelete(false); }}>Confirm</button>
                </>
              )}
            </div>
          </div>
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
    </>
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
    <div className="detail-path-row" title={value ?? "—"}>
      <span className="icon">{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="label">{label}</div>
        <div className="value">{value || "—"}</div>
      </div>
    </div>
  );
}
