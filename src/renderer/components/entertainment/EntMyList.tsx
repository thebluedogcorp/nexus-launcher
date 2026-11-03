// v6.0.0 — EntMyList: the local collection — Continue Watching (with progress
// + resume) and My List (watchlist). Everything persists on this PC.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import { EntLandscapeCard, PosterGrid } from "./EntRails";
import type { WatchPayload } from "./EntPlayer";
import type { TmdbMediaType } from "../../lib/tmdb-types";
import {
  getContinue,
  removeFromContinue,
  getList,
  removeFromList,
  type ContinueEntry,
  type ListItem,
} from "../../lib/ent-store";

interface MyListProps {
  listTick: number;
  progressTick: number;
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  onWatch: (payload: WatchPayload) => void;
  inList: (mediaType: TmdbMediaType, id: number) => boolean;
}

export function EntMyList({ listTick, progressTick, onOpen, onWatch, inList }: MyListProps) {
  const [cont, setCont] = useState<ContinueEntry[]>([]);
  const [list, setList] = useState<ListItem[]>([]);

  useEffect(() => {
    setCont(getContinue());
    setList(getList());
  }, [listTick, progressTick]);

  const refresh = () => {
    setCont(getContinue());
    setList(getList());
  };

  const empty = cont.length === 0 && list.length === 0;

  return (
    <div className="ent-page">
      <div className="ent-page-head">
        <div>
          <div className="ent-page-label">Collection · stored on this PC</div>
          <h1 className="ent-page-title">My List</h1>
        </div>
        <div className="ent-page-side">
          <Icon.Bookmark size={16} />
          <span>{list.length} saved · {cont.length} in progress</span>
        </div>
      </div>

      {empty && (
        <div className="ent-empty">
          <Icon.Bookmark size={36} />
          <p>Your list is empty</p>
          <span>Hover any title and press “My List”, or start watching — NEXUS remembers your progress locally.</span>
        </div>
      )}

      {/* Continue Watching */}
      {cont.length > 0 && (
        <section className="ent-ml-section">
          <h2 className="ent-ml-h">Continue Watching <span className="ent-rail-count">{cont.length}</span></h2>
          <div className="ent-ml-cont">
            {cont.map(e => (
              <EntLandscapeCard
                key={`${e.mediaType}-${e.id}`}
                item={e}
                forceMediaType={e.mediaType}
                onOpen={() => onWatch({
                  mediaType: e.mediaType,
                  id: e.id,
                  title: e.title,
                  posterPath: e.posterPath,
                  backdropPath: e.backdropPath,
                  season: e.season,
                  episode: e.episode,
                })}
                progress={e.progress}
                subLabel={e.mediaType === "tv" ? `Resume S${e.season} · E${e.episode}` : "Resume"}
                onRemove={() => { removeFromContinue(e.mediaType, e.id); refresh(); }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Saved list */}
      {list.length > 0 && (
        <section className="ent-ml-section">
          <h2 className="ent-ml-h">Saved Titles <span className="ent-rail-count">{list.length}</span></h2>
          <PosterGrid
            items={list}
            onOpen={onOpen}
            inList={inList}
          />
          <div className="ent-ml-hint">
            <Icon.Info size={12} /> Click a poster for details. Manage items from any detail page.
          </div>
        </section>
      )}
    </div>
  );
}
