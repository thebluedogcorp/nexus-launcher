// v7.2.0 — EntCollectionsView: user-created collections (playlists of titles).
// Create, rename, delete collections; add/remove titles; browse collection contents.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { EntPosterCard, type AnyItem } from "./EntRails";
import {
  getCollections, createCollection, deleteCollection, removeFromCollection,
  type Collection,
} from "../../lib/ent-userdata";
import { tmdbImg, type TmdbMediaType } from "../../lib/tmdb-types";

interface CollectionsProps {
  listTick: number;
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
}

export function EntCollectionsView({ listTick, onOpen }: CollectionsProps) {
  const [cols, setCols] = useState<Collection[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setCols(getCollections());
  }, [listTick]);

  const refresh = () => setCols(getCollections());
  const active = cols.find(c => c.id === activeId);

  const handleCreate = () => {
    if (!newName.trim()) return;
    const c = createCollection(newName);
    setNewName("");
    setCreating(false);
    refresh();
    setActiveId(c.id);
  };

  return (
    <div className="ent-page">
      <div className="ent-page-head">
        <div>
          <div className="ent-page-label">Curated · stored on this PC</div>
          <h1 className="ent-page-title">Collections</h1>
        </div>
        <div className="ent-page-side">
          <Icon.Library size={16} />
          <span>{cols.length} collections</span>
        </div>
      </div>

      {cols.length === 0 && !creating && (
        <div className="ent-empty">
          <Icon.Library size={36} />
          <p>No collections yet</p>
          <span>Create your first collection to group titles by theme, mood, or anything you like.</span>
          <button className="ent-cta primary" style={{ marginTop: 18 }} onClick={() => setCreating(true)}>
            <Icon.Plus size={15} /> Create Collection
          </button>
        </div>
      )}

      {creating && (
        <div className="ent-col-create">
          <input
            className="ent-col-input"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Collection name (e.g. 'Sci-Fi Saturdays')"
            onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            autoFocus
          />
          <button className="ent-cta primary" onClick={handleCreate}><Icon.Check size={15} /> Create</button>
          <button className="ent-cta ghost" onClick={() => setCreating(false)}>Cancel</button>
        </div>
      )}

      {cols.length > 0 && !creating && (
        <button className="ent-cta ghost" style={{ marginBottom: 20 }} onClick={() => setCreating(true)}>
          <Icon.Plus size={15} /> New Collection
        </button>
      )}

      {/* Collection list */}
      {cols.length > 0 && !active && (
        <div className="ent-col-list">
          {cols.map(c => (
            <div key={c.id} className="ent-col-card" onClick={() => setActiveId(c.id)}>
              <div className="ent-col-card-posters">
                {c.items.slice(0, 4).map((it, i) => (
                  <div key={i} className="ent-col-card-poster" style={{ zIndex: 4 - i }}>
                    {it.posterPath && <img src={tmdbImg(it.posterPath, "w185") ?? ""} alt="" />}
                  </div>
                ))}
                {c.items.length === 0 && <div className="ent-col-card-empty"><Icon.Library size={22} /></div>}
              </div>
              <div className="ent-col-card-body">
                <div className="ent-col-card-name">{c.name}</div>
                <div className="ent-col-card-meta">{c.items.length} title{c.items.length === 1 ? "" : "s"}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active collection detail */}
      {active && (
        <div className="ent-col-detail">
          <div className="ent-col-detail-head">
            <button className="ent-glass-pill" onClick={() => setActiveId(null)}>
              <Icon.ArrowLeft size={15} /> All Collections
            </button>
            <h2 className="ent-col-detail-title">{active.name}</h2>
            <button className="ent-cta ghost" onClick={() => { deleteCollection(active.id); setActiveId(null); refresh(); }}>
              <Icon.Trash size={14} /> Delete
            </button>
          </div>
          {active.items.length === 0 ? (
            <div className="ent-empty"><Icon.Library size={30} /><p>This collection is empty</p><span>Add titles from any detail page.</span></div>
          ) : (
            <div className="ent-grid">
              {active.items.map(it => (
                <div key={`${it.mediaType}-${it.id}`} className="ent-pcard-wrap">
                  <EntPosterCard
                    item={it as AnyItem}
                    forceMediaType={it.mediaType}
                    onOpen={onOpen}
                  />
                  <button
                    className="ent-col-remove"
                    onClick={() => { removeFromCollection(active.id, it.mediaType, it.id); refresh(); }}
                    title="Remove from collection"
                  >
                    <Icon.Close size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
