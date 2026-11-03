// v4.7.0 — PluginPageContainer. Renders a plugin-registered page by creating
// a container div, calling the plugin's mount() function, and calling
// unmount() on cleanup. This bridges the plugin's vanilla-JS rendering
// (mount/unmount) with React's lifecycle.

import { useEffect, useRef } from "react";
import type { PageExtension } from "@shared/plugin-types";

interface Props {
  extension: PageExtension;
}

export function PluginPageContainer({ extension }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      extension.mount(el);
    } catch (e) {
      el.innerHTML = `<div style="padding:24px;color:var(--text-faint)">Plugin page failed to load: ${e instanceof Error ? e.message : String(e)}</div>`;
    }
    return () => {
      try { extension.unmount?.(el); } catch { /* ignore */ }
    };
  }, [extension]);

  return <div ref={ref} style={{ width: "100%", height: "100%", minHeight: "60vh" }} />;
}
