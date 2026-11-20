import { useRef, useState, type CSSProperties } from "react";
import { useViewportSize } from "@mantine/hooks";
import "./panel-resizer.css";

export function usePanelWidth(minimum: number) {
  const [preferred, setPreferred] = useState<number | null>(null);
  const { width: viewport } = useViewportSize();
  // Leave usable space for the practice surface when both panels are enlarged.
  const maximum = Math.max(
    minimum,
    Math.min(560, Math.floor((viewport || window.innerWidth) * 0.35)),
  );
  const clamp = (width: number) =>
    Math.round(Math.max(minimum, Math.min(maximum, width)));
  return {
    width: clamp(preferred ?? minimum),
    minimum,
    maximum,
    resize: (width: number) => setPreferred(clamp(width)),
  };
}

export function PanelResizer({
  side,
  width,
  minimum,
  maximum,
  resize,
  label,
  className = "",
  onResizing,
}: {
  side: "left" | "right";
  width: number;
  minimum: number;
  maximum: number;
  resize(width: number): void;
  label: string;
  className?: string;
  onResizing?(active: boolean): void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [active, setActive] = useState(false);
  const direction = side === "left" ? 1 : -1;
  const finish = () => {
    drag.current = null;
    setActive(false);
    onResizing?.(false);
  };
  return (
    <div
      className={`panel-resizer ${className}`}
      data-side={side}
      data-resizing={active || undefined}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={width}
      aria-valuetext={`${width} pixels`}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onDoubleClick={() => resize(minimum)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = { x: event.clientX, width };
        event.currentTarget.setPointerCapture(event.pointerId);
        setActive(true);
        onResizing?.(true);
      }}
      onPointerMove={(event) => {
        if (drag.current)
          resize(
            drag.current.width + direction * (event.clientX - drag.current.x),
          );
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        finish();
      }}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        resize(
          event.key === "Home"
            ? minimum
            : event.key === "End"
              ? maximum
              : width + direction * (event.key === "ArrowRight" ? 16 : -16),
        );
      }}
      style={
        {
          "--panel-grip-color": "var(--mantine-color-dimmed, #8994a5)",
        } as CSSProperties
      }
    >
      <span aria-hidden="true" />
    </div>
  );
}
