import { useEffect, useRef, useState } from "react";
import { ActionIcon, Group, Modal, Stack, Text } from "@mantine/core";
import { ControlIcon } from "@ldayton/ui/control-icon";
import { fingeringWindow, type ChordPassage } from "./chord-passage-fingering";
const eventName = "songalong:guitar-chord";
type Selection = ChordPassage & { trigger: SVGElement };
/** Enlarge chord hit targets without changing engraving or passage selection. */
export function attachChordDiagrams(
  paper: HTMLElement,
  passages: readonly ChordPassage[],
) {
  for (const passage of passages) {
    const { name, element: text } = passage;
    if (!paper.contains(text) || text.closest(".guitar-chord-trigger"))
      continue;
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("guitar-chord-trigger");
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
      window.dispatchEvent(
        new CustomEvent<Selection>(eventName, {
          detail: { ...passage, trigger: group },
        }),
      );
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
  const trigger = useRef<SVGElement | null>(null);
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
  const shape = selected?.shapes[frame] || [];
  const { base, rows } = fingeringWindow(selected?.shapes || [], frame);
  const bottom = 55 + rows * 40;
  const description = shape
    .map(
      (f, i) =>
        `${["low E", "A", "D", "G", "B", "high E"][i]}: ${f === null ? "not played" : f === 0 ? "open" : `fret ${f}`}`,
    )
    .join("; ");
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
            Written notes at this point in the passage.
            {selected.capo
              ? ` Capo ${selected.capo}; frets are relative to the capo.`
              : ""}
          </Text>
          <svg
            viewBox={`0 0 240 ${bottom + 55}`}
            role="img"
            aria-label={`${selected.name} guitar chord: ${description}`}
            style={{
              display: "block",
              width: "100%",
              color: "var(--mantine-color-text)",
            }}
          >
            <title>{description}</title>
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
                  textAnchor="middle"
                  fontSize="14"
                  fill="currentColor"
                >
                  {["E", "A", "D", "G", "B", "e"][i]}
                </text>
              </g>
            ))}
            {base > 1 && (
              <text x="8" y="80" fontSize="14" fill="currentColor">
                {base}fr
              </text>
            )}
          </svg>
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
