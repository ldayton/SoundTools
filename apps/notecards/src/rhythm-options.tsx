import { useState } from "react";
import { NativeSelect, Stack } from "@mantine/core";
import {
  mergeRhythmSettings,
  RHYTHM_TEMPOS,
  type RhythmSettings,
} from "./rhythm-model";

const levels = [
  { value: "pulse", label: "Steady quarter notes" },
  { value: "long-short", label: "Long & short notes" },
  { value: "eighths", label: "Eighth notes & rests" },
];
const tempos = RHYTHM_TEMPOS.map((bpm) => ({
  value: String(bpm),
  label: `${bpm} BPM`,
}));

export function RhythmOptions({
  initialSettings,
  onChange,
}: {
  initialSettings: RhythmSettings;
  onChange(settings: RhythmSettings): void;
}) {
  const [settings, setSettings] = useState(initialSettings);
  function change(input: Partial<RhythmSettings>) {
    const next = mergeRhythmSettings(settings, input);
    setSettings(next);
    onChange(next);
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
      <NativeSelect
        id="rhythm-tempo"
        label="Tempo"
        data={tempos}
        value={String(settings.bpm)}
        onChange={(event) => change({ bpm: Number(event.currentTarget.value) })}
      />
    </Stack>
  );
}
