import { useChordPreview } from "./use-chord-preview";
import { guitarChordTones } from "./chord-preview";
import { attachChordTriggers } from "./chord-triggers";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionIcon, Group, Modal, Stack, Text } from "@mantine/core";
import { ControlIcon } from "@ldayton/ui/control-icon";
import { fingeringWindow, type ChordPassage } from "./chord-passage-fingering";
import type { ChordBarre } from "./guitar-scale-patterns";
const eventName = "songalong:guitar-chord";
type Selection = Pick<ChordPassage, "name" | "shapes" | "capo"> & {
  trigger: SVGElement | HTMLElement;
  descriptions?: string[];
};
export function showGuitarChordDiagram(selection: Selection) {
  window.dispatchEvent(
    new CustomEvent<Selection>(eventName, { detail: selection }),
  );
}
/** Enlarge chord hit targets without changing engraving or passage selection. */
export function attachChordDiagrams(
  paper: HTMLElement,
  passages: readonly ChordPassage[],
) {
  attachChordTriggers(
    paper,
    passages,
    "guitar-chord-trigger",
    (passage, trigger) => showGuitarChordDiagram({ ...passage, trigger }),
  );
}
export function GuitarChordDiagram() {
  const [selected, setSelected] = useState<Selection | null>(null);
  const trigger = useRef<SVGElement | HTMLElement | null>(null);
  const [frame, setFrame] = useState(0);
  const tones = useMemo(
    () =>
      selected
        ? guitarChordTones(selected.shapes[frame] || [], selected.capo)
        : [],
    [selected, frame],
  );
  const preview = useChordPreview(tones, "guitar");
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
    <Modal.Root
      opened={!!selected}
      onClose={() => setSelected(null)}
      size={280}
      centered
      returnFocus={false}
      onExitTransitionEnd={() => {
        if (trigger.current?.isConnected) trigger.current.focus();
        trigger.current = null;
      }}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Group gap="xs" wrap="nowrap">
            <Modal.Title>
              {selected ? `${selected.name} chord` : ""}
            </Modal.Title>
            {selected && (
              <ActionIcon
                variant="subtle"
                size={36}
                loading={preview.loading}
                aria-label={`Play ${selected.name} chord and breakdown`}
                onClick={() => void preview.play()}
              >
                <ControlIcon name="play" />
              </ActionIcon>
            )}
          </Group>
          <Modal.CloseButton aria-label="Close chord diagram" />
        </Modal.Header>
        <Modal.Body>
          {selected && (
            <Stack gap="sm">
              {preview.error && (
                <Text role="alert" size="sm" c="red">
                  {preview.error}
                </Text>
              )}
              <Text size="sm" c="dimmed">
                {selected.descriptions?.[frame] ||
                  "Written notes at this point in the passage."}
                {selected.capo
                  ? ` Capo ${selected.capo}; frets are relative to the capo.`
                  : ""}
              </Text>
              <GuitarChordGraphic
                name={selected.name}
                shapes={selected.shapes}
                frame={frame}
              />
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
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

/** Shared chord artwork for SongAlong's dialog and the inline scale panel. */
export function GuitarChordGraphic({name, shapes, frame = 0, horizontal = false, fingers, barres = []}: {
  name: string; shapes: (number|null)[][]; frame?: number; horizontal?: boolean;
  fingers?: (number|null)[]; barres?: ChordBarre[];
}) {
  const shape = shapes[frame] || [];
  const { base, rows } = fingeringWindow(shapes, frame);
  const bottom = 55 + rows * 40;
  const description = shape
    .map(
      (f, i) =>
        `${["low E", "A", "D", "G", "B", "high E"][i]}: ${f === null ? "not played" : f === 0 ? "open" : `fret ${f}${fingers?.[i] ? `, finger ${fingers[i]}` : ""}`}`,
    )
    .join("; ") + barres.map(b => `; finger ${b.finger} barre at fret ${b.fret}, strings ${b.fromString}–${b.toString}`).join("");
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
            {barres.map((barre, i) => (
              <line key={`barre${i}`} data-finger-barre={barre.finger} data-fret={barre.fret}
                data-from-string={barre.fromString} data-to-string={barre.toString}
                x1={42 + (6 - barre.fromString) * 32} x2={42 + (6 - barre.toString) * 32}
                y1={55 + (barre.fret - base + 0.5) * 40} y2={55 + (barre.fret - base + 0.5) * 40}
                stroke="currentColor" strokeWidth="18" strokeLinecap="round" opacity="0.35" />
            ))}
            {shape.map((f, i) => (
              <g
                key={i}
                data-string={6 - i}
                data-fret={f === null ? "not-played" : f}
                data-finger={fingers?.[i] ?? undefined}
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
                  <g>
                  <circle
                    cx={42 + i * 32}
                    cy={55 + (f - base + 0.5) * 40}
                    r="9"
                    fill="currentColor"
                  />
                  {fingers?.[i] && <text className="chord-finger"
                    x={42 + i * 32} y={55 + (f - base + 0.5) * 40}
                    transform={horizontal ? `rotate(90 ${42 + i * 32} ${55 + (f - base + 0.5) * 40})` : undefined}
                    textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="600"
                    fill="var(--mantine-color-body)">{fingers[i]}</text>}
                  </g>
                )}
                {!horizontal && <text
                  x={42 + i * 32}
                  y={bottom + 30}
                  transform={horizontal ? `rotate(90 ${42 + i * 32} ${bottom + 30})` : undefined}
                  textAnchor="middle"
                  fontSize="14"
                  fill="currentColor"
                >
                  {["E", "A", "D", "G", "B", "E"][i]}
                </text>}
              </g>
            ))}
            {!horizontal && base > 1 && (
              <text transform={horizontal ? "rotate(90 8 80)" : undefined} x="8" y="80" fontSize="14" fill="currentColor">
                {base}fr
              </text>
            )}
            </g>
            {horizontal && <>
              {shape.map((_, i) => <text key={`tuning${i}`} x="10" y={240 - (42 + i * 32)}
                textAnchor="middle" dominantBaseline="central" fontSize="14" fill="currentColor">
                {["E", "A", "D", "G", "B", "E"][i]}
              </text>)}
              {Array.from({length:rows},(_,i)=><text key={`number${i}`} x={55 + (i + 0.5) * 40} y="18"
                textAnchor="middle" fontSize="14" fill="currentColor">{base+i}</text>)}
            </>}
          </svg>
  );
}
