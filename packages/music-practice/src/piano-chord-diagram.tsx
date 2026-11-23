import { useEffect, useRef, useState } from "react";
import { Modal, Stack, Text } from "@mantine/core";
import { PianoKeyboard } from "@ldayton/ui/piano-keyboard";
import type { AbsoluteElement, RelativeElement, TuneObject } from "abcjs";
import { attachChordTriggers } from "./guitar-chord-diagram";
import { pianoChord } from "./piano-chord";
import { keyLabel } from "./piano-model";
import { holdPianoNote } from "./piano-audio";
const eventName = "songalong:piano-chord";
type Selection = NonNullable<ReturnType<typeof pianoChord>> & {
  name: string;
  trigger: SVGElement;
};
/** Use engraved/transposed chord names, so symbols and diagrams always agree. */
export function attachPianoChordDiagrams(paper: HTMLElement, tune: TuneObject) {
  const passages: (Selection & { element: SVGGraphicsElement })[] = [];
  for (const line of tune.lines)
    for (const staff of line.staff || [])
      for (const voice of staff.voices || [])
        for (const note of voice) {
          if (note.el_type !== "note") continue;
          const absolute = (note as typeof note & { abselem?: AbsoluteElement })
            .abselem;
          for (const child of absolute?.children || []) {
            const ink = child as RelativeElement & {
              graphelem?: SVGGraphicsElement;
            };
            if (ink.type !== "chord" || !ink.graphelem) continue;
            const name = ink.graphelem.textContent?.trim() || "";
            const chord = pianoChord(name);
            if (chord)
              passages.push({
                ...chord,
                name,
                element: ink.graphelem,
                trigger: ink.graphelem,
              });
          }
        }
  attachChordTriggers(
    paper,
    passages,
    "piano-chord-trigger",
    (passage, trigger) =>
      window.dispatchEvent(
        new CustomEvent<Selection>(eventName, {
          detail: { ...passage, trigger },
        }),
      ),
  );
}
export function PianoChordDiagram() {
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
  const low = selected ? Math.floor(selected.notes[0] / 12) * 12 : 48;
  const high = selected
    ? Math.floor(selected.notes.at(-1)! / 12) * 12 + 11
    : 59;
  return (
    <Modal
      opened={!!selected}
      onClose={() => setSelected(null)}
      title={selected ? `${selected.name} chord` : ""}
      size={520}
      centered
      closeButtonProps={{ "aria-label": "Close chord diagram" }}
      returnFocus={false}
      onExitTransitionEnd={() => {
        if (trigger.current?.isConnected) trigger.current.focus();
        trigger.current = null;
      }}
    >
      {selected && (
        <Stack gap="sm" className="piano-chord-diagram">
          <Text ta="center" fw={600} className="piano-chord-notes">
            {selected.labels.join(" · ")}
          </Text>
          <PianoKeyboard
            key={selected.name}
            rows={Array.from(
              { length: (high - low + 1) / 12 },
              (_, i) => [low + i * 12, low + i * 12 + 11] as const,
            )}
            voices={selected.notes.map((pitch) => ({ pitch, start: 0 }))}
            label={(midi) =>
              selected.labels[selected.notes.indexOf(midi)] ??
              `${keyLabel(midi, false).split(" / ")[0]}${Math.floor(midi / 12) - 1}`
            }
            onPress={holdPianoNote}
          />
          <Text size="xs" c="dimmed" ta="center">
            Chord tones, lowest to highest. Tap a key to hear it.
          </Text>
        </Stack>
      )}
    </Modal>
  );
}
