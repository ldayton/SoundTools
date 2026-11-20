import { useEffect, useRef, useState } from "react";
import { Modal } from "@mantine/core";
import { guitarChordShape } from "./hymn-arrangements";
const eventName = "songalong:guitar-chord";
type Selection = {
  name: string;
  shape: readonly (number | null)[];
  trigger: SVGElement;
};
export function chordDiagramShape(name: string) {
  const match = /^([A-G])([#♯b♭]?)(7)?$/.exec(name.trim());
  if (!match) return null;
  const root =
    ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as Record<string, number>)[
      match[1]
    ] + (/[#♯]/.test(match[2]) ? 1 : /[b♭]/.test(match[2]) ? -1 : 0);
  return guitarChordShape(root, !!match[3]);
}
/** Enlarge chord hit targets without changing engraving or passage selection. */
export function attachChordDiagrams(paper: HTMLElement) {
  for (const text of paper.querySelectorAll<SVGGraphicsElement>(
    ".abcjs-chord",
  )) {
    const name = text.textContent?.trim() || "",
      shape = chordDiagramShape(name);
    if (!shape) continue;
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
    text.parentNode!.insertBefore(group, text);
    group.append(target, text);
    const open = () => {
      window.dispatchEvent(
        new CustomEvent<Selection>(eventName, {
          detail: { name, shape, trigger: group },
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
  useEffect(() => {
    const open = (event: Event) => {
      const next = (event as CustomEvent<Selection>).detail;
      trigger.current = next.trigger;
      setSelected(next);
    };
    window.addEventListener(eventName, open);
    return () => window.removeEventListener(eventName, open);
  }, []);
  const frets =
    selected?.shape.filter((f): f is number => f !== null && f > 0) || [];
  const base =
    selected?.shape.includes(0) || Math.min(...frets) <= 3
      ? 1
      : Math.min(...frets);
  const description = selected?.shape
    .map(
      (f, i) =>
        `${["low E", "A", "D", "G", "B", "high E"][i]}: ${f === null ? "muted" : f === 0 ? "open" : `fret ${f}`}`,
    )
    .join("; ");
  return (
    <Modal
      opened={!!selected}
      onClose={() => setSelected(null)}
      title={selected ? `${selected.name} chord` : ""}
      size={280}
      centered
      returnFocus={false}
      onExitTransitionEnd={() => {
        if (trigger.current?.isConnected) trigger.current.focus();
        trigger.current = null;
      }}
    >
      {selected && (
        <svg
          viewBox="0 0 240 270"
          role="img"
          aria-label={`${selected.name} guitar chord: ${description}`}
          style={{
            display: "block",
            width: "100%",
            color: "var(--mantine-color-text)",
          }}
        >
          <title>{description}</title>
          {Array.from({ length: 5 }, (_, i) => (
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
          {selected.shape.map((f, i) => (
            <g key={i} data-string={6 - i} data-fret={f === null ? "muted" : f}>
              <line
                x1={42 + i * 32}
                x2={42 + i * 32}
                y1="55"
                y2="215"
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
                y="245"
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
      )}
    </Modal>
  );
}
