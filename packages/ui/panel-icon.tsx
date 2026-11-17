export function PanelIcon({
  side = "left",
}: {
  side?: "left" | "right" | "bottom";
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path
        d={
          side === "bottom"
            ? "M3 15h18m-12-5 3-3 3 3"
            : side === "right"
              ? "M15 4v16m-6-11 3 3-3 3"
              : "M9 4v16m6-11-3 3 3 3"
        }
      />
    </svg>
  );
}
