import { useState } from "react";
import { NativeSelect, Stack } from "@mantine/core";
import {
  mergePatternSettings,
  PATTERN_KEYS,
  type PatternSettings,
} from "./patterns-model";

const levels = [
  { value: "steps", label: "Steps & repeated notes" },
  { value: "skips", label: "Add skips · thirds" },
  { value: "leaps", label: "Add fourths & fifths" },
];
const keys = PATTERN_KEYS.map((key) => key.id);
const hands = [
  { value: "right", label: "Right hand" },
  { value: "left", label: "Left hand" },
];

export function PatternOptions({
  initialSettings,
  onChange,
}: {
  initialSettings: PatternSettings;
  onChange(settings: PatternSettings): void;
}) {
  const [settings, setSettings] = useState(initialSettings);
  function change(input: Partial<PatternSettings>) {
    const next = mergePatternSettings(settings, input);
    setSettings(next);
    onChange(next);
  }
  return (
    <Stack className="soundtools-ui">
      <NativeSelect
        id="pattern-level"
        label="Patterns"
        data={levels}
        value={settings.level}
        onChange={(event) =>
          change({
            level: event.currentTarget.value as PatternSettings["level"],
          })
        }
      />
      <NativeSelect
        id="pattern-key"
        label="Key"
        data={keys}
        value={settings.key}
        onChange={(event) => change({ key: event.currentTarget.value })}
      />
      <NativeSelect
        id="pattern-hand"
        label="Hand"
        data={hands}
        value={settings.hand}
        onChange={(event) =>
          change({ hand: event.currentTarget.value as PatternSettings["hand"] })
        }
      />
    </Stack>
  );
}
