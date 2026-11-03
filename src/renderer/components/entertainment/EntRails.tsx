// v6.0.0 — Card system for NEXUS TV:
//  - EntLandscapeCard: 16:9 backdrop card (network chip top-left, Oswald title
//    bottom-left, optional progress bar) — used by rails + Continue Watching.
//  - EntPosterCard: portrait 2:3 poster card — used by browse/search/my-list grids.
//  - Rail: titled horizontal scroller with hover arrows + skeletons.
//  - PosterGrid: responsive grid for dense browsing.

import { useRef } from "react";
import { Icon } from "../Icons";
import { tmdbImg, formatRating, type TmdbMediaType } from "../../lib/tmdb-types";

/** Minimal card data — satisfied by TmdbItem, TmdbMovie, and ContinueEntry. */
export interface LCardData {
  id: number;
  title: string;
  backdropPath?: string | null;
  posterPath?: string | null;
  rating?: number;
  year?: string;
}

export type AnyItem = LCardData & { mediaType?: TmdbMediaType };

function itemType(item: AnyItem, force?: TmdbMediaType): TmdbMediaType {
  return force ?? item.mediaType ?? "movie";
}

// ─── Landscape card ────────────────────────────────────────────────────────

interface LCardProps {
  item: AnyItem;
  forceMediaType?: TmdbMediaType;
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  /** 0–1 — renders the Continue Watching progress bar. */
  progress?: number;
  subLabel?: string;
  onRemove?: () => void;
}

export function EntLandscapeCard({ item, forceMediaType, onOpen, progress, subLabel, onRemove }: LCardProps) {
  const mt = itemType(item, forceMediaType);
  const art = tmdbImg(item.backdropPath ?? null, "w780") ?? tmdbImg(item.posterPath ?? null, "w500");
  const title = item.title;

  return (
    <div className="ent-lcard-wrap">
      <button className="ent-lcard" onClick={() => onOpen(mt, item.id)} title={title}>
        <div className="ent-lcard-media">
          {art ? (
            <img src={art} alt={title} loading="lazy" />
          ) : (
            <div className="ent-lcard-ph"><Icon.Film size={26} /></div>
          )}
          <span className={mt === "tv" ? "ent-lchip tv" : "ent-lchip"}>{mt === "tv" ? "Series" : "Film"}</span>
          <div className="ent-lcard-hover">
            <span className="ent-lcard-play"><Icon.Play size={18} /></span>
          </div>
          <div className="ent-lcard-meta">
            <div className="ent-lcard-title">{title}</div>
            <div className="ent-lcard-sub">
              {subLabel
                ? subLabel
                : <>
                    {(item.rating ?? 0) > 0 && <><Icon.Star size={9} filled /> {formatRating(item.rating!)}<span className="dotsep">·</span></>}
                    {item.year || "—"}
                  </>}
            </div>
          </div>
          {progress !== undefined && (
            <div className="ent-lcard-track"><div className="ent-lcard-bar" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          )}
        </div>
      </button>
      {onRemove && (
        <button className="ent-lcard-remove" onClick={onRemove} title="Remove from Continue Watching" aria-label="Remove">
          <Icon.Close size={13} />
        </button>
      )}
    </div>
  );
}

// ─── Poster card ───────────────────────────────────────────────────────────

interface PCardProps {
  item: AnyItem;
  forceMediaType?: TmdbMediaType;
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  inList?: boolean;
}

export function EntPosterCard({ item, forceMediaType, onOpen, inList }: PCardProps) {
  const mt = itemType(item, forceMediaType);
  const poster = tmdbImg(item.posterPath ?? null, "w342");

  return (
    <button className="ent-pcard" onClick={() => onOpen(mt, item.id)} title={item.title}>
      <div className="ent-pcard-media">
        {poster ? (
          <img src={poster} alt={item.title} loading="lazy" />
        ) : (
          <div className="ent-lcard-ph"><Icon.Film size={26} /></div>
        )}
        {(item.rating ?? 0) > 0 && (
          <div className="ent-pcard-rating"><Icon.Star size={9} filled /> {formatRating(item.rating!)}</div>
        )}
        <span className={mt === "tv" ? "ent-lchip tv" : "ent-lchip"}>{mt === "tv" ? "TV" : "Film"}</span>
        {inList && (
          <div className="ent-pcard-listed" title="In My List"><Icon.Bookmark size={11} filled /></div>
        )}
        <div className="ent-pcard-hover"><span className="ent-lcard-play"><Icon.Play size={16} /></span></div>
      </div>
      <div className="ent-pcard-title">{item.title}</div>
      <div className="ent-pcard-year">{item.year || "—"}</div>
    </button>
  );
}

// ─── Rail (landscape) ──────────────────────────────────────────────────────

interface RailProps {
  title: string;
  items: AnyItem[];
  forceMediaType?: TmdbMediaType;
  loading?: boolean;
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
}

export function Rail({ title, items, forceMediaType, loading, onOpen }: RailProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.85, 900), behavior: "smooth" });
  };

  if (!loading && items.length === 0) return null;

  return (
    <section className="ent-rail">
      <div className="ent-rail-head">
        <h2 className="ent-rail-title">{title}</h2>
        {loading ? <Icon.Spinner size={12} /> : <span className="ent-rail-count">{items.length}</span>}
        <div className="ent-rail-arrows">
          <button onClick={() => scroll(-1)} aria-label="Scroll left"><Icon.Chevron size={15} /></button>
          <button onClick={() => scroll(1)} aria-label="Scroll right"><Icon.Chevron size={15} /></button>
        </div>
      </div>
      <div className="ent-rail-track" ref={ref}>
        {loading
          ? Array.from({ length: 7 }).map((_, i) => (
              <div className="ent-lcard-wrap" key={i}>
                <div className="ent-lcard skel"><div className="ent-lcard-media" /></div>
              </div>
            ))
          : items.map(it => (
              <EntLandscapeCard
                key={`${it.id}-${forceMediaType ?? it.mediaType}`}
                item={it}
                forceMediaType={forceMediaType}
                onOpen={onOpen}
              />
            ))}
      </div>
    </section>
  );
}

// ─── Poster grid ───────────────────────────────────────────────────────────

interface GridProps {
  items: AnyItem[];
  forceMediaType?: TmdbMediaType;
  loading?: boolean;
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  inList?: (mediaType: TmdbMediaType, id: number) => boolean;
  skeletonCount?: number;
}

export function PosterGrid({ items, forceMediaType, loading, onOpen, inList, skeletonCount = 18 }: GridProps) {
  return (
    <div className="ent-grid">
      {loading
        ? Array.from({ length: skeletonCount }).map((_, i) => (
            <div className="ent-pcard skel" key={i}>
              <div className="ent-pcard-media" />
            </div>
          ))
        : items.map(it => (
            <EntPosterCard
              key={`${it.id}-${forceMediaType ?? it.mediaType}`}
              item={it}
              forceMediaType={forceMediaType}
              onOpen={onOpen}
              inList={inList?.((forceMediaType ?? it.mediaType ?? "movie"), it.id)}
            />
          ))}
    </div>
  );
}
