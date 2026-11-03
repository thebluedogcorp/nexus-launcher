// v6.0.0 — Card system for NEXUS TV:
//  - EntLandscapeCard: 16:9 backdrop card (network chip top-left, Oswald title
//    bottom-left, optional progress bar) — used by rails + Continue Watching.
//  - EntPosterCard: portrait 2:3 poster card — used by browse/search/my-list grids.
//  - EntHoverCard: Netflix-style expand-on-hover popover (poster, title, meta,
//    overview, quick actions) that lifts the card. v6.1.0.
//  - Rail: titled horizontal scroller with hover arrows + skeletons.
//  - Top10Rail: numbered ranked row (Netflix Top 10 style). v6.1.0.
//  - PosterGrid: responsive grid for dense browsing.

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icons";
import {
  tmdbImg,
  formatRating,
  MOVIE_GENRES,
  TV_GENRES,
  type TmdbMediaType,
} from "../../lib/tmdb-types";

/** Minimal card data — satisfied by TmdbItem, TmdbMovie, and ContinueEntry. */
export interface LCardData {
  id: number;
  title: string;
  backdropPath?: string | null;
  posterPath?: string | null;
  rating?: number;
  year?: string;
}

export type AnyItem = LCardData & {
  mediaType?: TmdbMediaType;
  overview?: string;
  genreIds?: number[];
};

// ─── shared helpers ────────────────────────────────────────────────────────

function itemType(item: AnyItem, force?: TmdbMediaType): TmdbMediaType {
  return force ?? item.mediaType ?? "movie";
}

function genreNamesFor(item: AnyItem, mt: TmdbMediaType): string[] {
  const catalog = mt === "tv" ? TV_GENRES : MOVIE_GENRES;
  return (item.genreIds ?? [])
    .map(gid => catalog.find(g => g.id === gid)?.name)
    .filter((n): n is string => !!n)
    .slice(0, 3);
}

/** A hover popover that expands a card after a short dwell. */
export function EntHoverCard({
  item,
  forceMediaType,
  onOpen,
  onWatch,
  inList,
  onToggleList,
}: {
  item: AnyItem;
  forceMediaType?: TmdbMediaType;
  onOpen: (mt: TmdbMediaType, id: number) => void;
  onWatch?: (mt: TmdbMediaType, id: number, title: string) => void;
  inList?: boolean;
  onToggleList?: (item: AnyItem) => void;
}) {
  const mt = itemType(item, forceMediaType);
  const poster = tmdbImg(item.posterPath ?? null, "w342");
  const genres = genreNamesFor(item, mt);
  const hasOverview = !!item.overview;

  return (
    <div className="ent-hover" onClick={e => { e.stopPropagation(); onOpen(mt, item.id); }}>
      <div className="ent-hover-media">
        {poster ? <img src={poster} alt={item.title} /> : <div className="ent-lcard-ph"><Icon.Film size={22} /></div>}
        <span className={mt === "tv" ? "ent-lchip tv" : "ent-lchip"}>{mt === "tv" ? "Series" : "Film"}</span>
        {(item.rating ?? 0) > 0 && (
          <div className="ent-pcard-rating"><Icon.Star size={9} filled /> {formatRating(item.rating!)}</div>
        )}
      </div>
      <div className="ent-hover-body">
        <div className="ent-hover-top">
          <div className="ent-hover-title">{item.title}</div>
          <div className="ent-hover-actions">
            {onWatch && (
              <button className="ent-hover-play" onClick={e => { e.stopPropagation(); onWatch(mt, item.id, item.title); }} title="Watch now" aria-label="Watch now">
                <Icon.Play size={13} />
              </button>
            )}
            {onToggleList && (
              <button
                className={inList ? "ent-hover-btn on" : "ent-hover-btn"}
                onClick={e => { e.stopPropagation(); onToggleList(item); }}
                title={inList ? "Remove from My List" : "Add to My List"}
                aria-label={inList ? "Remove from My List" : "Add to My List"}
              >
                <Icon.Bookmark size={12} filled={inList} />
              </button>
            )}
          </div>
        </div>
        <div className="ent-hover-meta">
          {item.year && <span>{item.year}</span>}
          <span className="ent-hover-type">{mt === "tv" ? "Series" : "Film"}</span>
          {(item.rating ?? 0) > 0 && <span className="ent-hover-match"><Icon.Star size={9} filled /> {Math.round((item.rating ?? 0) * 10)}% match</span>}
        </div>
        {genres.length > 0 && (
          <div className="ent-hover-genres">{genres.join(" · ")}</div>
        )}
        {hasOverview && (
          <p className="ent-hover-overview">{item.overview}</p>
        )}
      </div>
    </div>
  );
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
  onWatch?: (mt: TmdbMediaType, id: number, title: string) => void;
  onToggleList?: (item: AnyItem) => void;
  inList?: boolean;
  enableHover?: boolean;
}

export function EntLandscapeCard({ item, forceMediaType, onOpen, progress, subLabel, onRemove, onWatch, onToggleList, inList, enableHover }: LCardProps) {
  const mt = itemType(item, forceMediaType);
  const art = tmdbImg(item.backdropPath ?? null, "w780") ?? tmdbImg(item.posterPath ?? null, "w500");
  const title = item.title;
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const onEnter = () => {
    if (!enableHover) return;
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHovered(true), 450);
  };
  const onLeave = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    setHovered(false);
  };
  useEffect(() => () => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current); }, []);

  return (
    <div className="ent-lcard-wrap" onMouseEnter={onEnter} onMouseLeave={onLeave}>
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
      {enableHover && hovered && (
        <EntHoverCard
          item={item}
          forceMediaType={forceMediaType}
          onOpen={onOpen}
          onWatch={onWatch}
          inList={inList}
          onToggleList={onToggleList}
        />
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
  onWatch?: (mt: TmdbMediaType, id: number, title: string) => void;
  onToggleList?: (item: AnyItem) => void;
  enableHover?: boolean;
}

export function EntPosterCard({ item, forceMediaType, onOpen, inList, onWatch, onToggleList, enableHover }: PCardProps) {
  const mt = itemType(item, forceMediaType);
  const poster = tmdbImg(item.posterPath ?? null, "w342");
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const onEnter = () => {
    if (!enableHover) return;
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHovered(true), 450);
  };
  const onLeave = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    setHovered(false);
  };
  useEffect(() => () => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current); }, []);

  return (
    <div className="ent-pcard-wrap" onMouseEnter={onEnter} onMouseLeave={onLeave}>
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
      {enableHover && hovered && (
        <EntHoverCard
          item={item}
          forceMediaType={forceMediaType}
          onOpen={onOpen}
          onWatch={onWatch}
          inList={inList}
          onToggleList={onToggleList}
        />
      )}
    </div>
  );
}

// ─── Rail (landscape) ──────────────────────────────────────────────────────

interface RailProps {
  title: string;
  items: AnyItem[];
  forceMediaType?: TmdbMediaType;
  loading?: boolean;
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  onWatch?: (mt: TmdbMediaType, id: number, title: string) => void;
  onToggleList?: (item: AnyItem) => void;
  inList?: (mediaType: TmdbMediaType, id: number) => boolean;
  enableHover?: boolean;
}

export function Rail({ title, items, forceMediaType, loading, onOpen, onWatch, onToggleList, inList, enableHover }: RailProps) {
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
                onWatch={onWatch}
                onToggleList={onToggleList}
                inList={inList?.(forceMediaType ?? it.mediaType ?? "movie", it.id)}
                enableHover={enableHover}
              />
            ))}
      </div>
    </section>
  );
}

// ─── Top 10 Rail (Netflix-style numbered ranked row) ────────────────────────

interface Top10Props {
  title: string;
  items: AnyItem[];
  forceMediaType?: TmdbMediaType;
  loading?: boolean;
  onOpen: (mediaType: TmdbMediaType, id: number) => void;
  onWatch?: (mt: TmdbMediaType, id: number, title: string) => void;
  onToggleList?: (item: AnyItem) => void;
  inList?: (mediaType: TmdbMediaType, id: number) => boolean;
}

export function Top10Rail({ title, items, forceMediaType, loading, onOpen, onWatch, onToggleList, inList }: Top10Props) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.85, 900), behavior: "smooth" });
  };
  if (!loading && items.length === 0) return null;
  const ranked = items.slice(0, 10);

  return (
    <section className="ent-rail ent-top10">
      <div className="ent-rail-head">
        <h2 className="ent-rail-title"><Icon.TrendingUp size={14} /> {title}</h2>
        {loading ? <Icon.Spinner size={12} /> : <span className="ent-rail-count">{ranked.length}</span>}
        <div className="ent-rail-arrows">
          <button onClick={() => scroll(-1)} aria-label="Scroll left"><Icon.Chevron size={15} /></button>
          <button onClick={() => scroll(1)} aria-label="Scroll right"><Icon.Chevron size={15} /></button>
        </div>
      </div>
      <div className="ent-rail-track ent-top10-track" ref={ref}>
        {loading
          ? Array.from({ length: 7 }).map((_, i) => (
              <div className="ent-top10-item" key={i}>
                <span className="ent-top10-num">·</span>
                <div className="ent-pcard skel"><div className="ent-pcard-media" /></div>
              </div>
            ))
          : ranked.map((it, i) => (
              <div className="ent-top10-item" key={`${it.id}-${forceMediaType ?? it.mediaType}`}>
                <span className="ent-top10-num">{i + 1}</span>
                <EntPosterCard
                  item={it}
                  forceMediaType={forceMediaType}
                  onOpen={onOpen}
                  onWatch={onWatch}
                  onToggleList={onToggleList}
                  inList={inList?.(forceMediaType ?? it.mediaType ?? "movie", it.id)}
                  enableHover
                />
              </div>
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
  onWatch?: (mt: TmdbMediaType, id: number, title: string) => void;
  onToggleList?: (item: AnyItem) => void;
  enableHover?: boolean;
  skeletonCount?: number;
}

export function PosterGrid({ items, forceMediaType, loading, onOpen, inList, onWatch, onToggleList, enableHover, skeletonCount = 18 }: GridProps) {
  return (
    <div className="ent-grid">
      {loading
        ? Array.from({ length: skeletonCount }).map((_, i) => (
            <div className="ent-pcard skel" key={i}>
              <div className="ent-pcard-media" />
            </div>
          ))
        : items.map(it => {
            const mt = forceMediaType ?? it.mediaType ?? "movie";
            return (
              <EntPosterCard
                key={`${it.id}-${mt}`}
                item={it}
                forceMediaType={forceMediaType}
                onOpen={onOpen}
                onWatch={onWatch}
                onToggleList={onToggleList}
                inList={inList?.(mt, it.id)}
                enableHover={enableHover}
              />
            );
          })}
    </div>
  );
}
