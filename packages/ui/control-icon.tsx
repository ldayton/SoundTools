export type ControlIconName =
  | "star"
  | "guitar"
  | "settings"
  | "account"
  | "text-size"
  | "staff-spacing"
  | "go-start"
  | "tempo"
  | "play"
  | "pause"
  | "stop"
  | "record"
  | "microphone"
  | "restart"
  | "refresh"
  | "plus"
  | "minus"
  | "edit"
  | "more"
  | "chevron-down"
  | "chevron-up"
  | "chevron-right"
  | "chevron-left";

const artwork = {
  star: (
    <path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z" />
  ),
  guitar: (
    <>
      <path d="m13 9 6-6 2 2-6 6m-3-3c-2-1-4 0-4 2-4 0-6 4-3 7s7 1 7-3c2 0 3-2 2-4" />
      <circle cx="9" cy="13" r="1.5" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  tempo: (
    <>
      <path d="M9 18V5l10-2v13M9 8l10-2" />
      <ellipse cx="6" cy="18" rx="3" ry="2" />
      <ellipse cx="16" cy="16" rx="3" ry="2" />
    </>
  ),
  "go-start": (
    <>
      <path d="M5 5v14" />
      <path d="m19 5-11 7 11 7Z" fill="currentColor" stroke="none" />
    </>
  ),
  "staff-spacing": (
    <path d="M3 4h10M3 8h10M3 12h10M3 16h10M3 20h10M20 4v16m-3-13 3-3 3 3m-6 10 3 3 3-3" />
  ),
  "text-size": <path d="m2 19 5-14 5 14M4 14h6m4 5 4-9 4 9m-6-3h4" />,
  settings: <path d="M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-7 0v6" />,
  play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
  pause: <path d="M8 5v14M16 5v14" strokeWidth="3" />,
  stop: (
    <rect
      x="5"
      y="5"
      width="14"
      height="14"
      rx="1"
      fill="currentColor"
      stroke="none"
    />
  ),
  record: <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />,
  microphone: (
    <>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
    </>
  ),
  restart: (
    <>
      <path d="M3 10a9 9 0 1 1 1 8M3 4v6h6" />
    </>
  ),
  refresh: <path d="M21 10a9 9 0 1 0-1 8M21 4v6h-6" />,
  plus: <path d="M5 12h14M12 5v14" />,
  minus: <path d="M5 12h14" />,
  edit: <path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15Z" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-up": <path d="m6 15 6-6 6 6" />,
  "chevron-left": <path d="m15 6-6 6 6 6" />,
  "chevron-right": <path d="m9 6 6 6-6 6" />,
};

/** Fixed SVG geometry for shared controls, independent of platform symbol fonts. */
export function ControlIcon({
  name,
  size = 20,
  filled = false,
}: {
  name: ControlIconName;
  size?: number;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {artwork[name]}
    </svg>
  );
}
