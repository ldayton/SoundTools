import { ControlIcon } from "@ldayton/ui/control-icon";
import { useChordPreview } from "./use-chord-preview";
import {
  pianoChordEvent,
  type PianoChordSelection,
} from "./piano-chord-triggers";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionIcon, Group, Modal, Stack, Text } from "@mantine/core";
import { PianoKeyboard } from "@ldayton/ui/piano-keyboard";
import { keyLabel } from "./piano-model";
import { holdPianoNote } from "./piano-audio";
export function PianoChordDiagram() {
  const [selected, setSelected] = useState<PianoChordSelection | null>(null);
  const tones = useMemo(
    () => selected?.notes.map((pitch) => ({ pitch })) || [],
    [selected],
  );
  const preview = useChordPreview(tones, "piano");
  const trigger = useRef<SVGElement | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      const next = (event as CustomEvent<PianoChordSelection>).detail;
      trigger.current = next.trigger;
      setSelected(next);
    };
    window.addEventListener(pianoChordEvent, open);
    return () => window.removeEventListener(pianoChordEvent, open);
  }, []);
  const low = selected ? Math.floor(selected.notes[0] / 12) * 12 : 48;
  const high = selected
    ? Math.floor(selected.notes.at(-1)! / 12) * 12 + 11
    : 59;
  return (
    <Modal.Root
      opened={!!selected}
      onClose={() => setSelected(null)}
      size={520}
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
            <Stack gap="sm" className="piano-chord-diagram">
              <Text ta="center" fw={600} className="piano-chord-notes">
                {selected.labels.join(" · ")}
              </Text>
              {preview.error && (
                <Text role="alert" size="sm" c="red">
                  {preview.error}
                </Text>
              )}
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
            </Stack>
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
