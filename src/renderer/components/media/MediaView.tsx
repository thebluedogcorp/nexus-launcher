// v9.3.0 (M1) / E1 — MediaView: in-app local media shell.
//
// E1 — now renders the real Entertainment shell (dashboard, library
// management, server dashboard, settings, onboarding, detail page, player
// with resume). The original props signature is preserved so App.tsx stays
// compatible — `settings`, `onConfigure`, `onBack` are all accepted (the
// Entertainment shell uses `onBack` for the back button; `onConfigure` +
// `settings` are kept for compatibility with the existing splash wiring).
//
// Only the user's own files are ever served — no third-party stream hosts.

import { Entertainment } from "./Entertainment";

interface MediaViewProps {
  /** Current settings (kept for App.tsx compatibility — the Entertainment
   *  shell reads libraries + server configs directly via IPC). */
  settings: { mediaPaths: string; mediaAccessCode: string } | null;
  /** Navigate to the Settings → Media tab (kept for compatibility). */
  onConfigure: () => void;
  /** Return to the mode selector / games mode. */
  onBack?: () => void;
}

export function MediaView({ onBack }: MediaViewProps) {
  return <Entertainment onBack={onBack} />;
}
