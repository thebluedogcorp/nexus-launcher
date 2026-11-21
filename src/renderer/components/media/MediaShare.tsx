// v9.3.0 (M1) / E1 — MediaShare: QR + access-code panel for LAN sharing.
//
// E1 — now deprecated as a standalone panel (the Entertainment shell's
// Server Dashboard renders the real QR using the live server status). This
// component is kept as a thin wrapper for any external caller that still
// imports it; it renders nothing when no live server URL is provided.
//
// The QR encodes the REAL server URL (`http://<lanIp>:<port>`) — never a
// fake. It only renders when the server is actually running.

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Icon } from "../Icons";
import { listServerConfigs, getMediaServerStatus } from "../../lib/media-ipc";
import type { MediaServerStatus } from "@shared/types";

interface MediaShareProps {
  /** Kept for backward compatibility — unused in E1. */
  settings?: { mediaPaths: string; mediaAccessCode: string } | null;
}

export function MediaShare(_: MediaShareProps) {
  const [status, setStatus] = useState<MediaServerStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const configs = await listServerConfigs();
      if (configs.length === 0) { if (!cancelled) setStatus(null); return; }
      const st = await getMediaServerStatus(configs[0].id);
      if (!cancelled) setStatus(st);
    };
    void poll();
    const interval = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!status || !status.running || !status.url) {
    return (
      <section className="nx-media-share">
        <div className="nx-media-share-head"><Icon.Share size={14} /><h3>Local Network Sharing</h3></div>
        <div className="nx-media-share-body">
          <div className="nx-media-share-qr-col">
            <div className="nx-media-share-qr nx-ent-server-qr-off">
              <Icon.Lock size={36} />
              <p>Server stopped</p>
              <p className="nx-media-share-qr-cap">Start a server in the Servers tab to generate the QR.</p>
            </div>
          </div>
          <div className="nx-media-share-details">
            <p className="nx-media-share-note-row warn">
              <Icon.Lock size={12} />
              <span>No server is currently running. Configure one in the Servers tab — when running, the QR encodes the real LAN URL.</span>
            </p>
          </div>
        </div>
      </section>
    );
  }

  const url = status.url;
  return (
    <section className="nx-media-share">
      <div className="nx-media-share-head"><Icon.Share size={14} /><h3>Local Network Sharing</h3></div>
      <div className="nx-media-share-body">
        <div className="nx-media-share-qr-col">
          <div className="nx-media-share-qr">
            <QRCodeSVG value={url} size={148} level="M" />
          </div>
          <p className="nx-media-share-qr-cap">Open on a LAN device</p>
        </div>
        <div className="nx-media-share-details">
          <div className="nx-media-share-field">
            <label>LAN URL</label>
            <code className="nx-media-share-code">{url}</code>
            <button className="nx-media-btn" onClick={() => { try { navigator.clipboard.writeText(url); } catch { /* ignore */ } }}>
              <Icon.Tag size={13} /><span>Copy</span>
            </button>
          </div>
          <div className="nx-media-share-note">
            <p className="nx-media-share-note-row">
              <Icon.Volume size={12} />
              <span>Other devices on the same Wi-Fi / LAN scan the QR (or open the URL) to browse + play your library.</span>
            </p>
            <p className="nx-media-share-note-row warn">
              <Icon.Lock size={12} />
              <span>The host PC must stay running. Only your own files are served — nothing leaves your machine, no cloud, no telemetry, no third-party stream hosts.</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
