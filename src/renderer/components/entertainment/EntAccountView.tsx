// v9.0.0 — EntAccountView: the Account hub.
// Profile card (editable display name, member since, library stats) + the
// Downloads manager: adjustable download location (native folder picker),
// auto-download + smart-download toggles, quality preference, storage usage,
// and the downloads list with remove controls. All settings take effect
// immediately and persist locally.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { pushToast } from "./EntToaster";
import { tmdbImg, type TmdbMediaType } from "../../lib/tmdb-types";
import {
  getProfile, setProfileName,
  getStreak, getAllRatings, getAllReviews, getWatchedKeys,
} from "../../lib/ent-userdata";
import { getList, getContinue, getHistory } from "../../lib/ent-store";
import {
  getDownloadSettings, setDownloadSettings,
  getDownloads, removeDownload, clearAllDownloads,
  formatSize, type DownloadQuality,
} from "../../lib/ent-downloads";
import { getCollections } from "../../lib/ent-userdata";

interface AccountProps {
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  onDataChanged?: () => void;
}

export function EntAccountView({ onOpen, onDataChanged }: AccountProps) {
  const [profile, setProfileState] = useState(getProfile());
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.name);
  const [dl, setDl] = useState(getDownloadSettings());
  const [entries, setEntries] = useState(getDownloads());
  const [tick, setTick] = useState(0);
  void tick; // re-render trigger after mutations

  // Refresh on mount.
  useEffect(() => {
    setProfileState(getProfile());
    setDl(getDownloadSettings());
    setEntries(getDownloads());
  }, []);

  const saveName = () => {
    setProfileName(nameDraft);
    setProfileState(getProfile());
    setEditingName(false);
    pushToast("Profile name updated", "success", <Icon.Check size={13} />);
  };

  const pickLocation = async () => {
    const r = await window.nexus.pickFolder({ title: "Choose download location" });
    if (r && r.ok && r.path) {
      setDownloadSettings({ location: r.path });
      setDl(getDownloadSettings());
      pushToast("Download location updated", "success", <Icon.Download size={13} />);
    }
  };

  const setQuality = (q: DownloadQuality) => {
    setDownloadSettings({ quality: q });
    setDl(getDownloadSettings());
    pushToast(`Download quality: ${q}`, "info", <Icon.Download size={13} />);
  };

  const toggle = (key: "autoDownload" | "smartDownload") => {
    setDownloadSettings({ [key]: !dl[key] } as Partial<typeof dl>);
    setDl(getDownloadSettings());
    pushToast(`${key === "autoDownload" ? "Auto Download" : "Smart Download"} ${dl[key] ? "off" : "on"}`, "info", <Icon.Settings size={13} />);
  };

  const removeEntry = (e: (typeof entries)[number]) => {
    removeDownload(e.mediaType, e.id, e.season, e.episode);
    setEntries(getDownloads());
    pushToast(`Removed “${e.title}” from downloads`, "info", <Icon.Trash size={13} />);
  };

  const clearAll = () => {
    clearAllDownloads();
    setEntries(getDownloads());
    pushToast("All downloads removed", "success", <Icon.Trash size={13} />);
  };

  // Aggregated stats.
  const streak = getStreak();
  const stats = [
    { label: "In My List", value: getList().length, icon: <Icon.Bookmark size={13} /> },
    { label: "Continue Watching", value: getContinue().length, icon: <Icon.Play size={13} /> },
    { label: "Rated", value: getAllRatings().length, icon: <Icon.Star size={13} /> },
    { label: "Reviews", value: getAllReviews().length, icon: <Icon.Tag size={13} /> },
    { label: "Watched", value: getWatchedKeys().length, icon: <Icon.Eye size={13} /> },
    { label: "Collections", value: getCollections().length, icon: <Icon.Library size={13} /> },
    { label: "Viewed", value: getHistory().length, icon: <Icon.Clock2 size={13} /> },
    { label: "Streak", value: `${streak.current}d`, icon: <Icon.TrendingUp size={13} /> },
  ];

  const totalKB = entries.reduce((s, e) => s + e.sizeKB, 0);

  return (
    <div className="ent-page ent-account-page">
      <div className="ent-page-head">
        <div>
          <div className="ent-page-label"><Icon.Users size={12} /> NEXUS TV · Account</div>
          <h1 className="ent-page-title">Your Account</h1>
        </div>
      </div>

      {/* ── Profile card ── */}
      <section className="ent-acct-card">
        <div className="ent-acct-avatar" aria-hidden="true">
          <span>{profile.name.slice(0, 1).toUpperCase()}</span>
        </div>
        <div className="ent-acct-id">
          {editingName ? (
            <div className="ent-acct-name-edit">
              <input
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                maxLength={24}
                autoFocus
              />
              <button className="ent-cta primary sm" onClick={saveName}><Icon.Check size={13} /> Save</button>
              <button className="ent-cta ghost sm" onClick={() => setEditingName(false)}>Cancel</button>
            </div>
          ) : (
            <div className="ent-acct-name-row">
              <h2 className="ent-acct-name">{profile.name}</h2>
              <button className="ent-acct-edit" onClick={() => { setNameDraft(profile.name); setEditingName(true); }} title="Edit name">
                <Icon.Tag size={12} /> Edit
              </button>
            </div>
          )}
          <div className="ent-acct-meta">
            <span><Icon.CalendarCheck size={13} /> Member since {new Date(profile.memberSince).toLocaleDateString([], { month: "long", year: "numeric" })}</span>
            <span><Icon.Shield size={13} /> Local profile — nothing leaves this PC</span>
          </div>
        </div>
        <div className="ent-acct-streak">
          <Icon.TrendingUp size={16} />
          <div>
            <strong>{streak.current}-day</strong>
            <span>watch streak</span>
          </div>
        </div>
      </section>

      {/* ── Stats grid ── */}
      <section className="ent-acct-stats">
        {stats.map(s => (
          <div className="ent-acct-stat" key={s.label}>
            <div className="ent-acct-stat-v">{s.value}</div>
            <div className="ent-acct-stat-l">{s.icon} {s.label}</div>
          </div>
        ))}
      </section>

      {/* ── Downloads manager ── */}
      <section className="ent-acct-section">
        <div className="ent-acct-section-head">
          <h3><Icon.Download size={16} /> Downloads</h3>
          <span className="ent-acct-section-note">Offline packages — title info, artwork &amp; your data saved to disk for offline browsing.</span>
        </div>

        {/* Download location */}
        <div className="ent-dl-row">
          <div className="ent-dl-row-text">
            <span className="ent-dl-row-label"><Icon.Folder size={14} /> Download location</span>
            <span className="ent-dl-row-desc">{dl.location ? dl.location : "No location set — pick a folder to enable downloads."}</span>
          </div>
          <button className="ent-cta ghost sm" onClick={pickLocation}>
            <Icon.Folder size={13} /> {dl.location ? "Change" : "Choose Folder"}
          </button>
        </div>

        {/* Auto download */}
        <div className="ent-dl-row">
          <div className="ent-dl-row-text">
            <span className="ent-dl-row-label"><Icon.DownloadCloud size={14} /> Auto Download</span>
            <span className="ent-dl-row-desc">Automatically save the next episode offline when you finish one.</span>
          </div>
          <button className={dl.autoDownload ? "ent-toggle on" : "ent-toggle"} onClick={() => toggle("autoDownload")} role="switch" aria-checked={dl.autoDownload} aria-label="Auto Download" disabled={!dl.location}>
            <span className="ent-toggle-knob" />
          </button>
        </div>

        {/* Smart download */}
        <div className="ent-dl-row">
          <div className="ent-dl-row-text">
            <span className="ent-dl-row-label"><Icon.Wand size={14} /> Smart Download</span>
            <span className="ent-dl-row-desc">Delete an episode's offline package once you've watched it to free space.</span>
          </div>
          <button className={dl.smartDownload ? "ent-toggle on" : "ent-toggle"} onClick={() => toggle("smartDownload")} role="switch" aria-checked={dl.smartDownload} aria-label="Smart Download" disabled={!dl.location}>
            <span className="ent-toggle-knob" />
          </button>
        </div>

        {/* Download quality */}
        <div className="ent-dl-row">
          <div className="ent-dl-row-text">
            <span className="ent-dl-row-label"><Icon.Image size={14} /> Download quality</span>
            <span className="ent-dl-row-desc">Higher quality includes larger artwork and fuller episode data (~24–96 KB per title).</span>
          </div>
          <div className="ent-dl-quality">
            {(["standard", "high", "max"] as DownloadQuality[]).map(q => (
              <button key={q} className={dl.quality === q ? "ent-dl-q-btn on" : "ent-dl-q-btn"} onClick={() => setQuality(q)}>
                {q === "standard" ? "Standard" : q === "high" ? "High" : "Max"}
              </button>
            ))}
          </div>
        </div>

        {/* Storage usage */}
        <div className="ent-dl-storage">
          <div className="ent-dl-storage-head">
            <span>Storage used by NEXUS downloads</span>
            <span className="ent-dl-storage-val">{formatSize(totalKB)} · {entries.length} titles</span>
          </div>
          <div className="ent-dl-storage-bar">
            <span style={{ width: `${Math.min(8 + (totalKB / 1024) * 40, 100)}%` }} />
          </div>
          <span className="ent-dl-storage-hint">Offline packages are tiny by design (JSON). Video streams require an internet connection.</span>
        </div>

        {/* Downloads list */}
        <div className="ent-dl-list-head">
          <span>Downloaded titles ({entries.length})</span>
          {entries.length > 0 && (
            <button className="ent-dl-clear" onClick={clearAll}>
              <Icon.Trash size={12} /> Remove all
            </button>
          )}
        </div>
        {entries.length === 0 ? (
          <div className="ent-dl-empty">
            <Icon.Download size={28} />
            <p>No downloads yet</p>
            <span>Open any title and press <strong>Download</strong> — it lands in your chosen folder.</span>
          </div>
        ) : (
          <div className="ent-dl-list">
            {entries.map(e => (
              <div className="ent-dl-item" key={`${e.mediaType}-${e.id}-S${e.season ?? 0}-E${e.episode ?? 0}`}>
                <button className="ent-dl-item-poster" onClick={() => onOpen(e.mediaType, e.id)} title={e.title}>
                  {e.posterPath ? <img src={tmdbImg(e.posterPath, "w92")} alt={e.title} /> : <span className="ent-dl-item-ph"><Icon.Film size={16} /></span>}
                </button>
                <div className="ent-dl-item-body">
                  <button className="ent-dl-item-title" onClick={() => onOpen(e.mediaType, e.id)}>
                    {e.title}{e.season !== undefined && e.episode !== undefined ? ` · S${e.season} E${e.episode}` : ""}
                  </button>
                  <div className="ent-dl-item-meta">
                    <span>{e.mediaType === "tv" ? "Series" : "Film"}</span>
                    <span>{e.quality} quality</span>
                    <span>{formatSize(e.sizeKB)}</span>
                    <span>{new Date(e.downloadedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="ent-dl-item-path" title={e.filePath}>{e.filePath}</div>
                </div>
                <button className="ent-dl-item-remove" onClick={() => removeEntry(e)} title="Remove download" aria-label="Remove download">
                  <Icon.Trash size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Preferences shortcut ── */}
      <section className="ent-acct-section">
        <div className="ent-acct-section-head">
          <h3><Icon.Settings size={16} /> Preferences</h3>
        </div>
        <p className="ent-acct-note">
          Playback, parental controls, notifications and quiet hours live in Settings — press <kbd>,</kbd> or click the gear in the sidebar.
        </p>
      </section>
    </div>
  );
}
