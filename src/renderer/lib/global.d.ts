// Global type declarations for the secure preload bridge.
// `window.nexus` is injected by preload.ts (contextBridge).

import type { NexusApi } from "../main/preload";

declare global {
  interface Window {
    nexus: NexusApi;
  }
}

export {};
