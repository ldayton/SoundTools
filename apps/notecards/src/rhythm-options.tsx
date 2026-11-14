import { TempoControl } from "@ldayton/ui/tempo-control";
import { createViewState } from "./view-state";
import { useSyncExternalStore } from "react";
import { NativeSelect, Stack } from "@mantine/core";
import { RHYTHM_TEMPO_LIMITS, type RhythmSettings } from "./rhythm-model";

const levels = [
  { value: "pulse", label: "Steady quarter notes" },
  { value: "long-short", label: "Long & short notes" },
  { value: "eighths", label: "Eighth notes & rests" },
];

export const rhythmOptionsState = createViewState<RhythmSettings>;
export type RhythmOptionsState = ReturnType<typeof rhythmOptionsState>;
export function RhythmOptions({
  model,
  onChange,
}: {
  model: RhythmOptionsState;
  onChange(settings: RhythmSettings): void;
}) {
  const settings = useSyncExternalStore(model.subscribe, model.getSnapshot);
  function change(input: Partial<RhythmSettings>) {
    onChange({ ...settings, ...input });
  }
  return (
    <Stack className="soundtools-ui">
      <NativeSelect
        id="rhythm-level"
        label="Rhythm"
        data={levels}
        value={settings.level}
        onChange={(event) =>
          change({
            level: event.currentTarget.value as RhythmSettings["level"],
          })
        }
      />
      <TempoControl
        id="rhythm-tempo"
        value={settings.bpm}
        min={RHYTHM_TEMPO_LIMITS.min}
        max={RHYTHM_TEMPO_LIMITS.max}
        onChange={(bpm) => change({ bpm })}
      />
    </Stack>
  );
}
