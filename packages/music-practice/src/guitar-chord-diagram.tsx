import { useEffect, useRef, useState } from "react";
import { ActionIcon, Group, Modal, Stack, Text } from "@mantine/core";
import { ControlIcon } from "@ldayton/ui/control-icon";
import { fingeringWindow, type ChordPassage } from "./chord-passage-fingering";
const eventName = "songalong:guitar-chord";
type Selection = Pick<ChordPassage, "name" | "shapes" | "capo"> & {
  trigger: SVGElement | HTMLElement;
  descriptions?: string[];
};
export function showGuitarChordDiagram(selection: Selection) {
  window.dispatchEvent(new CustomEvent<Selection>(eventName, {detail: selection}));
}
/** Enlarge chord hit targets without changing engraving or passage selection. */
export function attachChordDiagrams(
  paper: HTMLElement,
  passages: readonly ChordPassage[],
) {
  attachChordTriggers(paper, passages, "guitar-chord-trigger", (passage, trigger) =>
    showGuitarChordDiagram({ ...passage, trigger }),
  );
}
/** Shared accessible chord hit targets for guitar and piano diagrams. */
export function attachChordTriggers<T extends { name: string; element: SVGGraphicsElement }>(
  paper: HTMLElement,
  passages: readonly T[],
  className: string,
  show: (passage: T, trigger: SVGElement) => void,
) {
  for (const passage of passages) {
    const { name, element: text } = passage;
    if (!paper.contains(text) || text.closest(`.${className}`))
      continue;
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add(className);
    group.setAttribute("role", "button");
    group.setAttribute("tabindex", "0");
    group.setAttribute("aria-label", `Show ${name} chord diagram`);
    group.setAttribute("aria-haspopup", "dialog");
    const bounds = text.getBBox(),
      target = document.createElementNS(group.namespaceURI, "rect");
    target.setAttribute("x", String(bounds.x - 8));
    target.setAttribute("y", String(bounds.y - 8));
    target.setAttribute("width", String(Math.max(32, bounds.width + 16)));
    target.setAttribute("height", String(Math.max(32, bounds.height + 16)));
    target.setAttribute("fill", "transparent");
    target.setAttribute("stroke", "none");
    if (text.hasAttribute("transform"))
      target.setAttribute("transform", text.getAttribute("transform")!);
    text.parentNode!.insertBefore(group, text);
    group.append(target, text);
    const open = () => {
      show(passage, group);
    };
    for (const event of ["pointerdown", "mousedown", "touchstart", "dblclick"])
      group.addEventListener(event, (event) => event.stopPropagation());
    group.addEventListener("click", (event) => {
      event.stopPropagation();
      open();
    });
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        open();
      }
    });
  }
}
export function GuitarChordDiagram() {
  const [selected, setSelected] = useState<Selection | null>(null);
  const trigger = useRef<SVGElement | HTMLElement | null>(null);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const open = (event: Event) => {
      const next = (event as CustomEvent<Selection>).detail;
      trigger.current = next.trigger;
      setFrame(0);
      setSelected(next);
    };
    window.addEventListener(eventName, open);
    return () => window.removeEventListener(eventName, open);
  }, []);
  return (
    <Modal
      opened={!!selected}
      onClose={() => setSelected(null)}
      title={selected ? `${selected.name} chord` : ""}
      closeButtonProps={{ "aria-label": "Close chord diagram" }}
      size={280}
      centered
      returnFocus={false}
      onExitTransitionEnd={() => {
        if (trigger.current?.isConnected) trigger.current.focus();
        trigger.current = null;
      }}
    >
      {selected && (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {selected.descriptions?.[frame] || "Written notes at this point in the passage."}
            {selected.capo
              ? ` Capo ${selected.capo}; frets are relative to the capo.`
              : ""}
          </Text>
          <GuitarChordGraphic name={selected.name} shapes={selected.shapes} frame={frame} />
          {selected.shapes.length > 1 && (
            <Group justify="space-between">
              <ActionIcon
                variant="default"
                size={44}
                aria-label="Previous fingering"
                disabled={frame === 0}
                onClick={() => setFrame((n) => n - 1)}
              >
                <ControlIcon name="chevron-left" />
              </ActionIcon>
              <Text size="sm" aria-live="polite">
                {frame + 1} / {selected.shapes.length}
              </Text>
              <ActionIcon
                variant="default"
                size={44}
                aria-label="Next fingering"
                disabled={frame === selected.shapes.length - 1}
                onClick={() => setFrame((n) => n + 1)}
              >
                <ControlIcon name="chevron-right" />
              </ActionIcon>
            </Group>
          )}
        </Stack>
      )}
    </Modal>
  );
}

/** Shared chord artwork for SongAlong's dialog and the inline scale panel. */
export function GuitarChordGraphic({name, shapes, frame = 0, horizontal = false}: {
  name: string; shapes: (number|null)[][]; frame?: number; horizontal?: boolean;
}) {
  const shape = shapes[frame] || [];
  const { base, rows } = fingeringWindow(shapes, frame);
  const bottom = 55 + rows * 40;
  const description = shape
    .map(
      (f, i) =>
        `${["low E", "A", "D", "G", "B", "high E"][i]}: ${f === null ? "not played" : f === 0 ? "open" : `fret ${f}`}`,
    )
    .join("; ");
  return (
          <svg
            viewBox={horizontal ? `0 0 ${bottom + 55} 240` : `0 0 240 ${bottom + 55}`}
            data-orientation={horizontal ? "horizontal" : "vertical"}
            role="img"
            aria-label={`${name} guitar chord: ${description}`}
            style={{
              display: "block",
              width: "100%",
              color: "var(--mantine-color-text)",
            }}
          >
            <title>{description}</title>
            <g transform={horizontal ? "translate(0 240) rotate(-90)" : undefined}>
            {Array.from({ length: rows + 1 }, (_, i) => (
              <line
                key={`f${i}`}
                x1="42"
                x2="202"
                y1={55 + i * 40}
                y2={55 + i * 40}
                stroke="currentColor"
                strokeWidth={i === 0 && base === 1 ? 5 : 1.2}
              />
            ))}
            {shape.map((f, i) => (
              <g
                key={i}
                data-string={6 - i}
                data-fret={f === null ? "not-played" : f}
              >
                <line
                  x1={42 + i * 32}
                  x2={42 + i * 32}
                  y1="55"
                  y2={bottom}
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                {f === null ? (
                  <text
                    x={42 + i * 32}
                    y="36"
                    transform={horizontal ? `rotate(90 ${42 + i * 32} 36)` : undefined}
                    textAnchor="middle"
                    fontSize="20"
                    fill="currentColor"
                  >
                    ×
                  </text>
                ) : f === 0 ? (
                  <circle
                    cx={42 + i * 32}
                    cy="28"
                    r="6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                ) : (
                  <circle
                    cx={42 + i * 32}
                    cy={55 + (f - base + 0.5) * 40}
                    r="9"
                    fill="currentColor"
                  />
                )}
                <text
                  x={42 + i * 32}
                  y={bottom + 30}
                  transform={horizontal ? `rotate(90 ${42 + i * 32} ${bottom + 30})` : undefined}
                  textAnchor="middle"
                  fontSize="14"
                  fill="currentColor"
                >
                  {["E", "A", "D", "G", "B", "E"][i]}
                </text>
              </g>
            ))}
            {base > 1 && (
              <text transform={horizontal ? "rotate(90 8 80)" : undefined} x="8" y="80" fontSize="14" fill="currentColor">
                {base}fr
              </text>
            )}
            </g>
          </svg>
  );
}
