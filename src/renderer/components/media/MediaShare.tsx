// v9.3.0 (M1) — MediaShare: QR + access-code panel for LAN sharing.
//
// Ported from the Next.js reference (src/components/media/media-share.tsx).
// Adaptations:
//   • `useSettings` (React Query) → settings passed in as a prop from the
//     parent MediaView, which reads them via window.nexus.getSettings().
//   • Access code persistence: `fetch("/api/settings", { settings: {...} })`
//     → `window.nexus.setSettings({ mediaAccessCode })`.
//   • LAN origin: in the Electron app there's no `window.location.hostname`
//     that gives the host PC's LAN IP (the renderer loads from
//     `file://`/`http://localhost:5173` in dev). Showing a fake URL would be
//     dishonest, so the panel shows the access code + a plain-language note
//     about entering it on another device on the same network. The QR
//     encodes the access code itself — usable once a LAN discovery endpoint
//     ships (deferred per task spec).
//
// Only the user's own files are ever served — no third-party stream hosts.

import { useCallback, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Icon } from "../Icons";

interface MediaShareProps {
  settings: { mediaPaths: string; mediaAccessCode: string } | null;
}

export function MediaShare({ settings }: MediaShareProps) {
  const code = settings?.mediaAccessCode ?? "";
  const [savedCode, setSavedCode] = useState<string>(code);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "info" | "success" | "error"; msg: string } | null>(null);

  // Sync local state when the parent settings change (e.g. after save).
  // We only update if the prop changes — never overwrite an in-flight edit.
  // (Using a simple equality check; the parent re-reads on save.)
  if (code !== savedCode && !busy && savedCode === "") {
    setSavedCode(code);
  }

  const persist = useCallback(async (newCode: string) => {
    setBusy(true);
    try {
      await window.nexus.setSettings({ mediaAccessCode: newCode });
      setSavedCode(newCode);
      setFlash({ kind: "success", msg: newCode ? "Access code saved." : "Access code cleared." });
    } catch (e) {
      setFlash({ kind: "error", msg: "Couldn't save access code: " + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  }, []);

  const regenerate = useCallback(() => {
    // 6-char base36 code (uppercase). Enough entropy for a LAN access code.
    const newCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    void persist(newCode);
  }, [persist]);

  const copy = useCallback((text: string, label: string) => {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setFlash({ kind: "success", msg: `${label} copied.` });
    } catch {
      setFlash({ kind: "error", msg: "Clipboard write failed." });
    }
  }, []);

  // Auto-dismiss flash after 4s.
  if (flash) {
    setTimeout(() => setFlash(null), 4000);
  }

  return (
    <section className="nx-media-share">
      <div className="nx-media-share-head">
        <Icon.Share size={14} />
        <h3>Local Network Sharing</h3>
      </div>

      <div className="nx-media-share-body">
        {/* QR — encodes the access code. Renders even when empty (the QR
            library handles empty strings as a blank-ish code). */}
        <div className="nx-media-share-qr-col">
          <div className="nx-media-share-qr">
            <QRCodeSVG value={code || "nexus-media"} size={148} level="M" />
          </div>
          <p className="nx-media-share-qr-cap">Access code QR</p>
        </div>

        <div className="nx-media-share-details">
          <div className="nx-media-share-field">
            <label>Access Code</label>
            <div className="nx-media-share-row">
              <code className="nx-media-share-code">{code || "—"}</code>
              <button
                className="nx-media-btn"
                onClick={regenerate}
                disabled={busy}
                title="Generate a new 6-character access code"
              >
                {busy ? <Icon.Spinner size={13} /> : <Icon.Refresh size={13} />}
                <span>New</span>
              </button>
              <button
                className="nx-media-btn"
                onClick={() => copy(code, "Code")}
                disabled={!code}
                title="Copy the access code"
              >
                <Icon.Tag size={13} />
                <span>Copy</span>
              </button>
            </div>
          </div>

          <div className="nx-media-share-note">
            <p className="nx-media-share-note-row">
              <Icon.Volume size={12} />
              <span>
                Other devices on the same Wi-Fi / LAN open NEXUS, go to Media,
                and the host PC streams from your library.
              </span>
            </p>
            <p className="nx-media-share-note-row warn">
              <Icon.Lock size={12} />
              <span>
                The host PC must stay running while streaming. Only your own
                files are served — nothing leaves your machine, no cloud, no
                telemetry, no third-party stream hosts.
              </span>
            </p>
          </div>

          {flash && (
            <div className={`nx-media-toast inline ${flash.kind}`}>
              {flash.kind === "success" ? <Icon.CheckCircle size={12} /> : <Icon.Info size={12} />}
              <span>{flash.msg}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
