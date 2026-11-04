// v8.0.0 — EntNotifications: an in-app notifications center.
// Shows new-episode / continue-watching alerts for saved TV titles, watch-streak
// milestones, and info notices. Opens from the sidebar bell. Quiet-hours aware
// (suppressed toasts, but the panel always shows everything).

import { useEffect, useState } from "react";
import { Icon } from "../Icons";
import {
  getNotifications,
  addNotification,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
  unreadNotificationCount,
  getStreak,
  type EntNotification,
} from "../../lib/ent-userdata";
import { getContinue, getList } from "../../lib/ent-store";

interface NotifProps {
  open: boolean;
  onClose: () => void;
  onOpen: (mediaType: "movie" | "tv", id: number) => void;
  onCountChange?: (n: number) => void;
}

const KIND_ICON: Record<EntNotification["kind"], React.ReactNode> = {
  "new-episode": <Icon.Tv size={15} />,
  "streak": <Icon.TrendingUp size={15} />,
  "recommendation": <Icon.Sparkles size={15} />,
  "info": <Icon.Info size={15} />,
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function EntNotifications({ open, onClose, onOpen, onCountChange }: NotifProps) {
  const [items, setItems] = useState<EntNotification[]>([]);
  const [tick, setTick] = useState(0);

  // Seed notifications once on mount: continue-watching for unfinished TV in
  // My List + streak milestones. Idempotent (addNotification dedupes by title/day).
  useEffect(() => {
    // Continue-watching items that are unfinished (TV with progress < 0.95).
    const cont = getContinue().filter(c => c.mediaType === "tv" && c.progress < 0.95).slice(0, 4);
    for (const c of cont) {
      addNotification({
        kind: "new-episode",
        title: `Continue ${c.title}`,
        body: `You're on S${c.season} · E${c.episode}. Pick up where you left off.`,
        target: { mediaType: c.mediaType, id: c.id },
      });
    }
    // My List TV titles with no continue entry → "new episode available" hint.
    const listTv = getList().filter(i => i.mediaType === "tv").slice(0, 3);
    for (const t of listTv) {
      const hasCont = getContinue().some(c => c.mediaType === "tv" && c.id === t.id);
      if (!hasCont) {
        addNotification({
          kind: "new-episode",
          title: `New to watch: ${t.title}`,
          body: `Saved in your list — start S1 · E1 anytime.`,
          target: { mediaType: t.mediaType, id: t.id },
        });
      }
    }
    // Streak milestone.
    const s = getStreak();
    if (s.current >= 3) {
      addNotification({
        kind: "streak",
        title: `${s.current}-day watch streak!`,
        body: s.longest === s.current ? `That's a new personal best. 🔥` : `Keep it going — your best is ${s.longest} days.`,
      });
    }
  }, []);

  // Refresh list + report unread count whenever opened or mutated.
  useEffect(() => {
    setItems(getNotifications());
    onCountChange?.(unreadNotificationCount());
  }, [open, tick, onCountChange]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const unread = items.filter(n => !n.read).length;

  const clickItem = (n: EntNotification) => {
    markNotificationRead(n.id);
    setTick(t => t + 1);
    if (n.target) { onOpen(n.target.mediaType, n.target.id); onClose(); }
  };

  return (
    <div className="ent-notif-overlay" role="dialog" aria-modal="false" aria-label="Notifications" onMouseDown={onClose}>
      <div className="ent-notif" onMouseDown={e => e.stopPropagation()}>
        <div className="ent-notif-head">
          <div className="ent-notif-title">
            <Icon.Bell size={17} />
            <span>Notifications</span>
            {unread > 0 && <span className="ent-notif-count">{unread}</span>}
          </div>
          <div className="ent-notif-actions">
            {items.length > 0 && (
              <>
                <button className="ent-notif-action" onClick={() => { markAllNotificationsRead(); setTick(t => t + 1); }} title="Mark all read">
                  <Icon.Check size={13} /> Read all
                </button>
                <button className="ent-notif-action warn" onClick={() => { clearNotifications(); setTick(t => t + 1); }} title="Clear all">
                  <Icon.Trash size={13} /> Clear
                </button>
              </>
            )}
            <button className="ent-notif-close" onClick={onClose} aria-label="Close">
              <Icon.Close size={15} />
            </button>
          </div>
        </div>

        <div className="ent-notif-body">
          {items.length === 0 ? (
            <div className="ent-notif-empty">
              <Icon.Bell size={30} />
              <p>You're all caught up</p>
              <span>New-episode alerts for your saved series will appear here.</span>
            </div>
          ) : (
            items.map(n => (
              <button
                key={n.id}
                className={n.read ? "ent-notif-item" : "ent-notif-item unread"}
                onClick={() => clickItem(n)}
              >
                <span className={`ent-notif-icon ${n.kind}`}>{KIND_ICON[n.kind]}</span>
                <span className="ent-notif-content">
                  <span className="ent-notif-item-title">{n.title}</span>
                  <span className="ent-notif-item-body">{n.body}</span>
                  <span className="ent-notif-item-time">{timeAgo(n.createdAt)}</span>
                </span>
                {!n.read && <span className="ent-notif-dot" />}
              </button>
            ))
          )}
        </div>

        <div className="ent-notif-foot">
          <span className="ent-notif-foot-dot" />
          <span>Quiet hours respected · stored locally</span>
        </div>
      </div>
    </div>
  );
}
