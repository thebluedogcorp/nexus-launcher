import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

// Defensive bootstrap: if the preload bridge didn't load (e.g. the native
// better-sqlite3 module failed in the main process), show a clear diagnostic
// screen instead of a blank black window.
function isBridgeReady(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { nexus?: unknown }).nexus === "object" &&
    typeof (window as unknown as { nexus?: { listGames?: unknown } }).nexus?.listGames === "function"
  );
}

if (!isBridgeReady()) {
  root.render(
    <div style={{ padding: 40, color: "#f87171", fontFamily: "Segoe UI, sans-serif", background: "#0a0a0b", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>NEXUS couldn't start</h1>
      <p style={{ color: "#d4d4d8", lineHeight: 1.6 }}>
        The secure IPC bridge (<code>window.nexus</code>) is not available. This usually means the
        <strong> native database module (better-sqlite3)</strong> failed to load in the packaged app —
        typically an Electron ABI mismatch.
      </p>
      <p style={{ color: "#a1a1aa", marginTop: 16, lineHeight: 1.6 }}>
        Please <strong>re-download</strong> the latest <code>NEXUS-Setup-1.0.0.exe</code> from the
        GitHub release — the build pipeline now rebuilds better-sqlite3 for the exact Electron
        version and unpacks it from the asar so it loads correctly.
      </p>
      <p style={{ color: "#71717a", marginTop: 16, fontSize: 12, fontFamily: "monospace" }}>
        Bridge check: typeof window.nexus = {typeof (window as unknown as { nexus?: unknown }).nexus}
      </p>
    </div>,
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
