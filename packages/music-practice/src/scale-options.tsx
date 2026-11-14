import { useSyncExternalStore } from "react";
import { NativeSelect, Stack } from "@mantine/core";
import { SCALE_SHAPES, type ScalePattern } from "./guitar-scale-patterns";
import { SCALE_TONICS, scaleLabel, type ScaleQuality } from "./guitar-scales";
import { createViewState } from "./view-state";
export type ScaleOptionsSnapshot = {
  tonic: number;
  quality: ScaleQuality;
  spelling?: string;
  pattern: ScalePattern;
  labels: "fingers" | "notes";
};
export const scaleOptionsState = createViewState<ScaleOptionsSnapshot>;
export type ScaleOptionsState = ReturnType<typeof scaleOptionsState>;
export function ScaleOptions({
  model,
  change,
}: {
  model: ScaleOptionsState;
  change(patch: Partial<ScaleOptionsSnapshot>): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <Stack className="soundtools-ui">
      <NativeSelect
        id="scale-key"
        label="Key"
        aria-label="Scale key"
        value={String(state.tonic)}
        data={SCALE_TONICS[state.quality].map((name, i) => ({
          value: String(i),
          label: scaleLabel(
            i === state.tonic && state.spelling ? state.spelling : name,
          ),
        }))}
        onChange={(e) => change({ tonic: Number(e.currentTarget.value) })}
      />
      <NativeSelect
        id="scale-quality"
        label="Scale"
        aria-label="Scale type"
        value={state.quality}
        data={[
          { value: "major", label: "Major" },
          { value: "minor", label: "Natural minor" },
        ]}
        onChange={(e) =>
          change({ quality: e.currentTarget.value as ScaleQuality })
        }
      />
      <NativeSelect
        id="scale-pattern"
        label="Pattern"
        value={state.pattern}
        data={[
          { value: "map", label: "Open-position map" },
          ...SCALE_SHAPES.map((value) => ({ value, label: `Shape ${value}` })),
        ]}
        onChange={(e) =>
          change({ pattern: e.currentTarget.value as ScalePattern })
        }
      />
      <NativeSelect
        id="scale-dot-labels"
        label="Dots"
        value={state.labels}
        data={[
          { value: "fingers", label: "Finger numbers" },
          { value: "notes", label: "Note names" },
        ]}
        onChange={(e) =>
          change({
            labels: e.currentTarget.value as ScaleOptionsSnapshot["labels"],
          })
        }
      />
    </Stack>
  );
}
