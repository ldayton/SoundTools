import { useState } from "react";
import { Splitter } from "@mantine/core";
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
  const [active, setActive] = useState(false);
  const fixed = side === "left" ? 0 : 1;
  const pane = (
    <Splitter.Pane
      defaultSize={`${minimum}px`}
      min={`${minimum}px`}
      max={`${maximum}px`}
    />
  );
  // The shell already positions and scrolls its content. A transparent splitter
  // track controls those existing widths without moving or remounting the forms.
  return (
    <Splitter
      className={`panel-resizer ${className}`}
      data-side={side}
      data-resizing={active || undefined}
      sizes={side === "left" ? [`${width}px`, 100] : [100, `${width}px`]}
      onSizeChange={(sizes) => resize(parseFloat(String(sizes[fixed])))}
      onResizeStart={() => {
        setActive(true);
        onResizing?.(true);
      }}
      onResizeEnd={() => {
        setActive(false);
        onResizing?.(false);
      }}
      step="16px"
      shiftStep="48px"
      attributes={{
        handle: {
          "aria-label": label,
          title: "Drag to resize. Double-click to reset.",
        },
      }}
      classNames={{ handle: "panel-resizer-handle" }}
      style={{ width: maximum + 400 }}
    >
      {side === "left" ? pane : <Splitter.Pane defaultSize={100} min="400px" />}
      {side === "right" ? (
        pane
      ) : (
        <Splitter.Pane defaultSize={100} min="400px" />
      )}
    </Splitter>
  );
}
