// v4.2.0 — Minimal NEXUS lettermark. A single geometric "N" drawn as one
// filled path. No gradients, no extra shapes — just the mark. Inherits color
// via currentColor so the same component renders in accent (topbar), white
// (on dark), or black (on accent) depending on context.

interface LogoProps {
  size?: number;
  className?: string;
}

export function NexusMark({ size = 18, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* A single filled "N": two uprights joined by a diagonal.
          Geometric, even stroke weight, optical padding of ~7px. */}
      <path d="M8 25 L8 7 L11.6 7 L20.4 19.2 L20.4 7 L24 7 L24 25 L20.4 25 L11.6 12.8 L11.6 25 Z" />
    </svg>
  );
}

// A compact wordmark used in the About card and large empty states.
export function NexusWordmark({ size = 18, className }: LogoProps) {
  return (
    <span
      className={className}
      style={{
        fontSize: size,
        fontWeight: 800,
        letterSpacing: "-0.04em",
        lineHeight: 1,
        fontFamily: '"Inter","Segoe UI",system-ui,sans-serif',
      }}
    >
      NEXUS
    </span>
  );
}
