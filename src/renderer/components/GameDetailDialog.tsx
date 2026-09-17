import { useEffect, useState } from "react";
import type { Game } from "@shared/types";
import { CoverArt } from "./CoverArt";
import { Icon } from "./Icons";
import {
  formatDate, formatPlaytime, formatSize, relativeTime, platformLabel, platformColor,
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

  useEffect(() => {
    setConfirmDelete(false);
  }, [game?.id]);

  if (!game) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="detail-banner">
          <CoverArt title={game.title} platform={game.platform} coverImage={game.coverImage} showOverlay={false} />
          <div className="detail-banner-overlay" />
          <div className="detail-title-wrap">
            <div className="detail-chips">
              <span className="chip" style={{ background: "rgba(0,0,0,0.5)" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: platformColor(game.platform), display: "inline-block" }} />
                {platformLabel(game.platform)}
              </span>
              <span className={game.source === "auto" ? "chip auto" : "chip manual"}>
                {game.source === "auto" ? "Auto-detected" : "Manually added"}
              </span>
              {game.rating !== null && (
                <span className="chip" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>
                  <Icon.Star size={11} filled /> {game.rating.toFixed(1)}
                </span>
              )}
            </div>
            <h2 className="detail-title">{game.title}</h2>
          </div>
          <button className="modal-close" onClick={onClose} style={{ position: "absolute", top: 12, right: 12 }}>
            <Icon.Close size={16} />
          </button>
        </div>

        <div className="detail-body">
          <div className="detail-actions">
            <button className="btn btn-primary" onClick={() => onLaunch(game)}>
              <Icon.Play size={15} /> Play Now
            </button>
            <button className="btn btn-ghost" onClick={() => onPatch(game)}>
              <Icon.Refresh size={15} /> Patch Metadata
            </button>
            <button
              className={game.favorite ? "btn btn-outline" : "btn btn-ghost"}
              onClick={() => onToggleFav(game)}
            >
              <Icon.Heart size={15} filled={game.favorite} /> {game.favorite ? "Favorited" : "Favorite"}
            </button>
          </div>

          {game.description ? (
            <p className="detail-desc">{game.description}</p>
          ) : (
            <div style={{ border: "1px dashed var(--nx-border)", background: "rgba(255,255,255,0.02)", borderRadius: 10, padding: 12, fontSize: 12, color: "var(--nx-text-faint)" }}>
              No description yet — click <strong style={{ color: "var(--nx-text-dim)" }}>Patch Metadata</strong> to fetch details from RAWG.
            </div>
          )}

          {game.genres.length > 0 && (
            <div className="detail-genres">
              {game.genres.map((g) => (
                <span key={g} className="genre-pill">
                  <Icon.Star size={10} /> {g}
                </span>
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
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--nx-text-faint)", marginBottom: 8 }}>
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

          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            {game.rawgId !== null && (
              <a
                href={`https://rawg.io/games/${game.rawgId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
                style={{ flex: 1, justifyContent: "center", fontSize: 11 }}
              >
                <Icon.ExternalLink size={13} /> RAWG
              </a>
            )}
            {!confirmDelete ? (
              <button className="btn btn-danger" style={{ flex: 1, justifyContent: "center" }} onClick={() => setConfirmDelete(true)}>
                <Icon.Trash size={13} /> Remove
              </button>
            ) : (
              <>
                <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center", fontSize: 11 }} onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
                <button className="btn btn-danger" style={{ flex: 1, justifyContent: "center", fontSize: 11 }} onClick={() => { onDelete(game); setConfirmDelete(false); }}>
                  Confirm
                </button>
              </>
            )}
          </div>
        </div>
      </div>
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
    <div className="detail-path-row" title={value ?? "—"}>
      <span className="icon">{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="label">{label}</div>
        <div className="value">{value || "—"}</div>
      </div>
    </div>
  );
}
