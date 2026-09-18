import { useEffect, useState } from "react";
import type { Game, PlatformId } from "@shared/types";
import { PLATFORM_LIST } from "@shared/types";
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
  onUpdate: (g: Game, patch: Record<string, unknown>) => Promise<void>;
  onOpenDir: (g: Game) => void;
}

const COMPLETION_STATUSES = [
  { value: "", label: "Not Set" },
  { value: "playing", label: "Playing" },
  { value: "completed", label: "Completed" },
  { value: "backlog", label: "Backlog" },
  { value: "abandoned", label: "Abandoned" },
  { value: "wishlist", label: "Wishlist" },
] as const;

/** Full-screen dedicated game page with immersive customization/edit mode. */
export function GamePage({ game, onClose, onLaunch, onPatch, onDelete, onToggleFav, onUpdate, onOpenDir }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  // Edit form state
  const [editTitle, setEditTitle] = useState("");
  const [editPlatform, setEditPlatform] = useState<PlatformId>("manual");
  const [editExecutable, setEditExecutable] = useState("");
  const [editInstallDir, setEditInstallDir] = useState("");
  const [editLaunchCommand, setEditLaunchCommand] = useState("");
  const [editCoverImage, setEditCoverImage] = useState("");
  const [editBannerImage, setEditBannerImage] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDeveloper, setEditDeveloper] = useState("");
  const [editPublisher, setEditPublisher] = useState("");
  const [editReleaseDate, setEditReleaseDate] = useState("");
  const [editGenres, setEditGenres] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState<string>("");
  const [editUserRating, setEditUserRating] = useState<number>(0);
  const [editSize, setEditSize] = useState("");

  useEffect(() => {
    setConfirmDelete(false); setLightbox(null); setScrollY(0); setEditMode(false);
    if (game) {
      setEditTitle(game.title);
      setEditPlatform(game.platform);
      setEditExecutable(game.executable ?? "");
      setEditInstallDir(game.installDir ?? "");
      setEditLaunchCommand(game.launchCommand ?? "");
      setEditCoverImage(game.coverImage ?? "");
      setEditBannerImage(game.bannerImage ?? "");
      setEditDescription(game.description ?? "");
      setEditDeveloper(game.developer ?? "");
      setEditPublisher(game.publisher ?? "");
      setEditReleaseDate(game.releaseDate ?? "");
      setEditGenres(game.genres.join(", "));
      setEditNotes(game.notes ?? "");
      setEditStatus(game.completionStatus || "");
      setEditUserRating(game.userRating ?? 0);
      setEditSize(game.sizeBytes?.toString() ?? "");
    }
  }, [game?.id]);

  if (!game) return null;

  const banner = editMode ? (editBannerImage || editCoverImage) : (game.bannerImage || game.coverImage);
  const grad = gradientFor(game.title);
  const heroTransform = `translateY(${scrollY * 0.4}px) scale(${1 + scrollY * 0.0003})`;

  const saveEdits = async () => {
    setSaving(true);
    try {
      await onUpdate(game, {
        title: editTitle.trim(),
        platform: editPlatform,
        executable: editExecutable.trim() || null,
        installDir: editInstallDir.trim() || null,
        launchCommand: editLaunchCommand.trim() || null,
        coverImage: editCoverImage.trim() || null,
        bannerImage: editBannerImage.trim() || null,
        description: editDescription.trim() || null,
        developer: editDeveloper.trim() || null,
        publisher: editPublisher.trim() || null,
        releaseDate: editReleaseDate.trim() || null,
        genres: editGenres.split(",").map((s) => s.trim()).filter(Boolean),
        notes: editNotes.trim() || null,
        completionStatus: editStatus,
        userRating: editUserRating || null,
        sizeBytes: editSize ? Number(editSize) : null,
      });
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="game-page" onScroll={(e) => setScrollY((e.target as HTMLElement).scrollTop)}>
      <button className="gp-back" onClick={onClose} title="Back to library">
        <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon.Chevron size={20} /></span>
      </button>

      {/* ===== CINEMATIC HERO ===== */}
      <div className="gp-hero">
        {editMode ? (
          // Edit mode: show live preview + image URL inputs
          <>
            <div className="gp-hero-bg" style={{
              backgroundImage: banner ? `url(${banner})` : `radial-gradient(circle at 30% 20%, ${grad.from}, #060608 70%)`,
              transform: heroTransform,
            }} />
            <div className="gp-hero-overlay" />
            <div className="gp-hero-content">
              <div className="gp-chips">
                <span className="chip" style={{ background: "rgba(0,168,225,0.2)", color: "#5ac8e8", borderColor: "rgba(0,168,225,0.3)" }}>
                  <Icon.FileCog size={11} /> Edit Mode
                </span>
              </div>
              <h1 className="gp-title" style={{ fontSize: 36 }}>{editTitle || "Game Title"}</h1>
            </div>
          </>
        ) : (
          <>
            <div className="gp-hero-bg" style={{
              backgroundImage: banner ? `url(${banner})` : `radial-gradient(circle at 30% 20%, ${grad.from}, #060608 70%)`,
              transform: heroTransform,
            }} />
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
                {game.rating !== null && <span className="chip gold"><Icon.Star size={11} filled /> {game.rating.toFixed(1)}</span>}
                {game.userRating && <span className="chip gold"><Icon.Star size={11} filled /> You: {game.userRating}</span>}
                {game.favorite && <span className="chip auto"><Icon.Star size={11} filled /> Favorite</span>}
                {game.completionStatus && <span className="chip" style={{ background: "rgba(0,168,225,0.15)", color: "#5ac8e8", borderColor: "rgba(0,168,225,0.25)" }}>{game.completionStatus}</span>}
              </div>
              <h1 className="gp-title">{game.title}</h1>
              <div className="gp-meta">
                {game.developer && <span>{game.developer}</span>}
                {game.releaseDate && <><span className="dot" /><span>{formatDate(game.releaseDate)}</span></>}
                {game.playtimeSec > 0 && <><span className="dot" /><span>{formatPlaytime(game.playtimeSec)} played</span></>}
                {game.launchCount > 0 && <><span className="dot" /><span>{game.launchCount} launches</span></>}
                {game.sizeBytes && <><span className="dot" /><span>{formatSize(game.sizeBytes)}</span></>}
                {game.lastPlayedAt && <><span className="dot" /><span>Last: {relativeTime(game.lastPlayedAt)}</span></>}
              </div>
              <div className="gp-actions">
                <button className="gp-play" onClick={() => onLaunch(game)}><Icon.Play size={18} /> Play Now</button>
                <button className="btn btn-ghost" style={{ height: 52, padding: "0 22px", fontSize: 15 }} onClick={() => onPatch(game)}>
                  <Icon.Refresh size={17} /> Patch
                </button>
                <button className={game.favorite ? "btn btn-outline" : "btn btn-ghost"} style={{ height: 52, width: 52, padding: 0, justifyContent: "center" }} onClick={() => onToggleFav(game)} title="Favorite">
                  <Icon.Star size={18} filled={game.favorite} />
                </button>
                <button className="btn btn-ghost" style={{ height: 52, width: 52, padding: 0, justifyContent: "center" }} onClick={() => onOpenDir(game)} title="Open directory">
                  <Icon.Folder size={18} />
                </button>
                <button className="btn btn-ghost" style={{ height: 52, width: 52, padding: 0, justifyContent: "center" }} onClick={() => setEditMode(true)} title="Customize (Edit)">
                  <Icon.FileCog size={18} />
                </button>
              </div>
              {/* User rating stars (inline, clickable) */}
              <div style={{ display: "flex", gap: 4, marginTop: 14 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={async () => { await onUpdate(game, { userRating: game.userRating === n ? null : n }); }}
                    style={{ color: game.userRating && game.userRating >= n ? "var(--gold)" : "rgba(255,255,255,0.2)", transition: "color .12s" }}>
                    <Icon.Star size={18} filled={game.userRating ? game.userRating >= n : false} />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ===== BODY ===== */}
      <div className="gp-body">
        {editMode ? (
          // ===== EDIT MODE =====
          <div>
            <div className="gp-section-title"><span className="bar" /> Customize Game — Edit Everything</div>
            <p style={{ fontSize: 13, color: "var(--nx-text-dim)", marginBottom: 16, lineHeight: 1.6 }}>
              Like Steam's "Properties" but more powerful. Change the title, logo, banner, description, developer, publisher,
              release date, genres, platform, launch command, executable path, install directory, notes, completion status,
              user rating, and disk size. Everything you change here overrides the auto-detected values.
            </p>

            {/* JSON Import / Export */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "14px 16px",
              background: "rgba(0,168,225,0.05)", border: "1px solid rgba(0,168,225,0.15)", borderRadius: 11,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#fff" }}>Import / Export Metadata as JSON</div>
                <div style={{ fontSize: 11, color: "var(--nx-text-dim)", marginTop: 2, lineHeight: 1.5 }}>
                  Import a .json file to fill all fields at once, or export the current values to share/back up.
                  Perfect for games without metadata — create a JSON file once, import it on any machine.
                </div>
              </div>
              <label className="btn btn-outline btn-sm" style={{ cursor: "pointer", flexShrink: 0 }}>
                <Icon.DownloadCloud size={14} /> Import JSON
                <input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={async (e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  try {
                    const text = await f.text();
                    const data = JSON.parse(text) as Record<string, unknown>;
                    // Apply each field if present in the JSON
                    if (typeof data.title === "string") setEditTitle(data.title);
                    if (typeof data.platform === "string") setEditPlatform(data.platform as PlatformId);
                    if (typeof data.coverImage === "string") setEditCoverImage(data.coverImage);
                    if (typeof data.bannerImage === "string") setEditBannerImage(data.bannerImage);
                    if (typeof data.description === "string") setEditDescription(data.description);
                    if (typeof data.developer === "string") setEditDeveloper(data.developer);
                    if (typeof data.publisher === "string") setEditPublisher(data.publisher);
                    if (typeof data.releaseDate === "string") setEditReleaseDate(data.releaseDate);
                    if (Array.isArray(data.genres)) setEditGenres(data.genres.join(", "));
                    else if (typeof data.genres === "string") setEditGenres(data.genres);
                    if (typeof data.executable === "string") setEditExecutable(data.executable);
                    if (typeof data.installDir === "string") setEditInstallDir(data.installDir);
                    if (typeof data.launchCommand === "string") setEditLaunchCommand(data.launchCommand);
                    if (typeof data.notes === "string") setEditNotes(data.notes);
                    if (typeof data.completionStatus === "string") setEditStatus(data.completionStatus);
                    if (typeof data.userRating === "number") setEditUserRating(data.userRating);
                    if (typeof data.sizeBytes === "number") setEditSize(String(data.sizeBytes));
                  } catch { /* ignore parse errors */ }
                  e.target.value = "";
                }} />
              </label>
              <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => {
                const data: Record<string, unknown> = {
                  title: editTitle,
                  platform: editPlatform,
                  coverImage: editCoverImage || null,
                  bannerImage: editBannerImage || null,
                  description: editDescription || null,
                  developer: editDeveloper || null,
                  publisher: editPublisher || null,
                  releaseDate: editReleaseDate || null,
                  genres: editGenres.split(",").map((s) => s.trim()).filter(Boolean),
                  executable: editExecutable || null,
                  installDir: editInstallDir || null,
                  launchCommand: editLaunchCommand || null,
                  notes: editNotes || null,
                  completionStatus: editStatus || null,
                  userRating: editUserRating || null,
                  sizeBytes: editSize ? Number(editSize) : null,
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${editTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.nexus.json`;
                a.click(); URL.revokeObjectURL(url);
              }}>
                <Icon.Download size={14} /> Export JSON
              </button>
            </div>

            {/* JSON format reference (collapsible) */}
            <details style={{ marginBottom: 20 }}>
              <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--nx-text-dim)", fontWeight: 600, padding: "8px 0" }}>
                📋 JSON Format Reference (click to expand)
              </summary>
              <pre style={{
                marginTop: 8, padding: 14, borderRadius: 10,
                background: "rgba(0,0,0,0.3)", border: "1px solid var(--nx-border)",
                fontSize: 11, lineHeight: 1.6, color: "var(--nx-text-dim)",
                fontFamily: '"Cascadia Code", Consolas, monospace',
                overflowX: "auto", whiteSpace: "pre",
              }}>{`{
  "title": "My Custom Game",
  "platform": "manual",
  "coverImage": "https://example.com/poster.jpg",
  "bannerImage": "https://example.com/banner.jpg",
  "description": "A description of the game...",
  "developer": "Studio Name",
  "publisher": "Publisher Name",
  "releaseDate": "2024-01-15",
  "genres": ["Action", "RPG", "Open World"],
  "executable": "C:\\\\Games\\\\game.exe",
  "installDir": "C:\\\\Games\\\\MyGame",
  "launchCommand": "steam://run/123456",
  "notes": "Personal notes, mods, settings...",
  "completionStatus": "playing",
  "userRating": 5,
  "sizeBytes": 50000000000
}`}</pre>
              <p style={{ fontSize: 11, color: "var(--nx-text-faint)", marginTop: 8, lineHeight: 1.6 }}>
                All fields are <strong>optional</strong> — only include the ones you want to set. Unspecified fields won't be cleared.
                <br />Valid platforms: <code>steam, epic, gog, xbox, ubisoft, battlenet, ea, riot, manual, custom</code>
                <br />Valid completionStatus: <code>playing, completed, backlog, abandoned, wishlist</code> (or empty string)
                <br />userRating: <code>1</code> to <code>5</code> (or <code>null</code> to clear)
              </p>
            </details>

            {/* Title + Platform */}
            <div className="editor-row">
              <div className="editor-field"><label>Title</label><input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Game title" /></div>
              <div className="editor-field"><label>Platform</label>
                <select value={editPlatform} onChange={(e) => setEditPlatform(e.target.value as PlatformId)}>
                  {PLATFORM_LIST.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            </div>

            {/* Cover + Banner URLs */}
            <div className="editor-row">
              <div className="editor-field"><label>Cover Image (Poster) URL</label><input value={editCoverImage} onChange={(e) => setEditCoverImage(e.target.value)} placeholder="https://…/poster.jpg" /></div>
              <div className="editor-field"><label>Banner Image (Wide) URL</label><input value={editBannerImage} onChange={(e) => setEditBannerImage(e.target.value)} placeholder="https://…/banner.jpg" /></div>
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--nx-text-faint)", marginBottom: 5 }}>Cover Preview</label>
                <div style={{ width: 120, aspectRatio: "3/4", borderRadius: 10, overflow: "hidden", border: "1px solid var(--nx-border)" }}>
                  {editCoverImage ? <img src={editCoverImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : <div style={{ width: "100%", height: "100%", background: "var(--nx-surface)" }} />}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--nx-text-faint)", marginBottom: 5 }}>Banner Preview</label>
                <div style={{ width: 200, aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", border: "1px solid var(--nx-border)" }}>
                  {editBannerImage ? <img src={editBannerImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} /> : <div style={{ width: "100%", height: "100%", background: "var(--nx-surface)" }} />}
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="editor-field"><label>Description</label><textarea className="notes-area" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Game description…" style={{ minHeight: 100 }} /></div>

            {/* Developer + Publisher */}
            <div className="editor-row">
              <div className="editor-field"><label>Developer</label><input value={editDeveloper} onChange={(e) => setEditDeveloper(e.target.value)} placeholder="Developer name" /></div>
              <div className="editor-field"><label>Publisher</label><input value={editPublisher} onChange={(e) => setEditPublisher(e.target.value)} placeholder="Publisher name" /></div>
            </div>

            {/* Release date + Genres */}
            <div className="editor-row">
              <div className="editor-field"><label>Release Date</label><input value={editReleaseDate} onChange={(e) => setEditReleaseDate(e.target.value)} placeholder="2024-01-15" /></div>
              <div className="editor-field"><label>Genres (comma-separated)</label><input value={editGenres} onChange={(e) => setEditGenres(e.target.value)} placeholder="Action, RPG, Open World" /></div>
            </div>

            {/* Paths */}
            <div className="editor-field"><label>Executable Path</label><input value={editExecutable} onChange={(e) => setEditExecutable(e.target.value)} placeholder="C:\Games\game.exe" /></div>
            <div className="editor-field"><label>Install Directory</label><input value={editInstallDir} onChange={(e) => setEditInstallDir(e.target.value)} placeholder="C:\Games\MyGame" /></div>
            <div className="editor-field"><label>Launch Command (URI or shell command)</label><input value={editLaunchCommand} onChange={(e) => setEditLaunchCommand(e.target.value)} placeholder="steam://run/1245620" /></div>

            {/* Completion status + User rating + Size */}
            <div className="editor-row">
              <div className="editor-field"><label>Completion Status</label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  {COMPLETION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="editor-field"><label>User Rating (0-5)</label>
                <div style={{ display: "flex", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setEditUserRating(editUserRating === n ? 0 : n)} style={{ color: editUserRating >= n ? "var(--gold)" : "rgba(255,255,255,0.2)" }}>
                      <Icon.Star size={22} filled={editUserRating >= n} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="editor-row">
              <div className="editor-field"><label>Disk Size (bytes)</label><input value={editSize} onChange={(e) => setEditSize(e.target.value)} placeholder="50000000000" /></div>
            </div>

            {/* Notes */}
            <div className="editor-field"><label>Personal Notes</label><textarea className="notes-area" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Your personal notes about this game — mods, settings, tips, etc." /></div>

            {/* Save / Cancel */}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-primary" onClick={saveEdits} disabled={saving}>
                {saving ? <Icon.Spinner size={15} /> : <Icon.Check size={15} />} Save Changes
              </button>
              <button className="btn btn-ghost" onClick={() => setEditMode(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          // ===== VIEW MODE =====
          <>
            {/* Description */}
            <div className="gp-section-title"><span className="bar" /> About</div>
            {game.description ? (
              <p className="gp-desc" dangerouslySetInnerHTML={{ __html: stripHtml(game.description) }} />
            ) : (
              <div style={{ border: "1px dashed var(--nx-border)", background: "rgba(255,255,255,0.02)", borderRadius: 12, padding: 18, fontSize: 13, color: "var(--nx-text-faint)" }}>
                No description yet — click <strong style={{ color: "var(--nx-text-dim)" }}>Patch</strong> to fetch from RAWG + Steam, or click the <strong style={{ color: "var(--nx-text-dim)" }}>Customize</strong> (gear) icon to add your own.
              </div>
            )}

            {/* Personal notes */}
            {game.notes && (
              <>
                <div className="gp-section-title" style={{ marginTop: 32 }}><span className="bar" /> Your Notes</div>
                <div style={{ background: "rgba(74,222,128,0.04)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 11, padding: 16, fontSize: 13, color: "var(--nx-text-dim)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{game.notes}</div>
              </>
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

            {/* Completion status (clickable) */}
            <div className="gp-section-title" style={{ marginTop: 32 }}><span className="bar" /> Status</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {COMPLETION_STATUSES.filter((s) => s.value).map((s) => (
                <button key={s.value} onClick={async () => { await onUpdate(game, { completionStatus: game.completionStatus === s.value ? "" : s.value }); }}
                  style={{
                    padding: "6px 14px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, transition: "all .15s",
                    border: `1px solid ${game.completionStatus === s.value ? "rgba(0,168,225,0.35)" : "var(--nx-border)"}`,
                    background: game.completionStatus === s.value ? "rgba(0,168,225,0.1)" : "rgba(255,255,255,0.03)",
                    color: game.completionStatus === s.value ? "#5ac8e8" : "var(--nx-text-dim)",
                  }}>{s.label}</button>
              ))}
            </div>

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
              <button className="btn btn-ghost" onClick={() => setEditMode(true)}><Icon.FileCog size={14} /> Customize Game</button>
              <button className="btn btn-ghost" onClick={() => onOpenDir(game)}><Icon.Folder size={14} /> Open Directory</button>
              <button className="btn btn-ghost" onClick={() => onPatch(game)}><Icon.Refresh size={14} /> Re-patch Metadata</button>
              {game.rawgId !== null && game.rawgId !== 0 && (
                <a href={`https://rawg.io/games/${game.rawgId}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost"><Icon.ExternalLink size={14} /> RAWG</a>
              )}
              {!confirmDelete ? (
                <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}><Icon.Trash size={14} /> Remove</button>
              ) : (
                <>
                  <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
                  <button className="btn btn-danger" onClick={() => { onDelete(game); setConfirmDelete(false); }}><Icon.Trash size={14} /> Confirm Removal</button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <button className="modal-close lightbox-close" onClick={() => setLightbox(null)} style={{ background: "rgba(0,0,0,0.5)" }}><Icon.Close size={20} /></button>
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

function stripHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
