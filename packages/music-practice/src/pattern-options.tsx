import { createViewState } from "./view-state";
import { useSyncExternalStore } from "react";
import { NativeSelect, Stack } from "@mantine/core";
import { PATTERN_KEYS, type PatternSettings } from "./patterns-model";

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

export const patternOptionsState = createViewState<PatternSettings>;
export type PatternOptionsState = ReturnType<typeof patternOptionsState>;
export function PatternOptions({
  model,
  onChange,
}: {
  model: PatternOptionsState;
  onChange(settings: PatternSettings): void;
}) {
  const settings = useSyncExternalStore(model.subscribe, model.getSnapshot);
  function change(input: Partial<PatternSettings>) {
    onChange({ ...settings, ...input });
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
