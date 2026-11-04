// v6.4.0 — Toast notifications for NEXUS TV.
// A tiny pub/sub store + a portal-free renderer. Any part of the app can
// push a toast (added to list, started watching, cleared history, etc.) and
// the EntShell shows a stack in the bottom-left that auto-dismisses.

import { useEffect, useState } from "react";
import { Icon } from "../Icons";

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "success" | "error";
  icon?: React.ReactNode;
}

let nextId = 1;
let listeners: Array<(toasts: Toast[]) => void> = [];
let toasts: Toast[] = [];

function emit() { for (const l of listeners) l(toasts); }

export function pushToast(message: string, kind: Toast["kind"] = "info", icon?: React.ReactNode) {
  const t: Toast = { id: nextId++, message, kind, icon };
  toasts = [...toasts, t];
  emit();
  // auto-dismiss after 3.2s
  setTimeout(() => dismissToast(t.id), 3200);
  return t.id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter(t => t.id !== id);
  emit();
}

export function EntToaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const l = (t: Toast[]) => setItems(t);
    listeners.push(l);
    return () => { listeners = listeners.filter(x => x !== l); };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="ent-toaster" role="region" aria-label="Notifications" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className={`ent-toast ${t.kind}`} role="status">
          <span className="ent-toast-icon">
            {t.icon ?? (t.kind === "success" ? <Icon.Check size={15} /> : t.kind === "error" ? <Icon.Close size={15} /> : <Icon.Info size={15} />)}
          </span>
          <span className="ent-toast-msg">{t.message}</span>
          <button className="ent-toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <Icon.Close size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
