import { HILA_SHAPES, type HilaShape } from "./hila-scale-shapes";
import { useSyncExternalStore } from "react";
import { NativeSelect, Stack, SimpleGrid } from "@mantine/core";
import { SCALE_SHAPES, type ScalePattern } from "./guitar-scale-patterns";
import {
  SCALE_FRET_LIMIT,
  SCALE_TONICS,
  scaleLabel,
  type ScaleQuality,
} from "./guitar-scales";
import { createViewState } from "./view-state";
export type ScaleOptionsSnapshot = {
  shapeSet: "standard" | "hila";
  hilaShape: HilaShape;
  tonic: number;
  quality: ScaleQuality;
  spelling?: string;
  pattern: ScalePattern;
  labels: "fingers" | "notes" | "none";
  firstFret: number;
  lastFret: number;
  linked: ScalePattern | "none";
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
          { value: "major-pentatonic", label: "Major pentatonic" },
          { value: "minor-pentatonic", label: "Minor pentatonic" },
          { value: "major-blues", label: "Major blues" },
          { value: "minor-blues", label: "Minor blues" },
        ]}
        onChange={(e) =>
          change({ quality: e.currentTarget.value as ScaleQuality })
        }
      />
      {state.quality === "major" && (
        <NativeSelect
          label="Shape set"
          value={state.shapeSet}
          data={[
            { value: "standard", label: "Standard · five shapes" },
            { value: "hila", label: "Extended Set" },
          ]}
          onChange={(e) =>
            change({ shapeSet: e.currentTarget.value as "standard" | "hila" })
          }
        />
      )}
      {state.shapeSet === "hila" ? (
        <NativeSelect
          label="Shape"
          value={String(state.hilaShape)}
          data={HILA_SHAPES.map((n) => ({
            value: String(n),
            label: `Shape ${n}`,
          }))}
          onChange={(e) =>
            change({ hilaShape: Number(e.currentTarget.value) as HilaShape })
          }
        />
      ) : (
        <NativeSelect
          id="scale-pattern"
          label="Pattern"
          value={state.pattern}
          data={[
            { value: "map", label: "Fret range" },
            ...SCALE_SHAPES.map((value) => ({
              value,
              label: `Shape ${value}`,
            })),
          ]}
          onChange={(e) =>
            change({ pattern: e.currentTarget.value as ScalePattern })
          }
        />
      )}
      {state.shapeSet === "standard" && state.pattern === "map" && (
        <SimpleGrid cols={2}>
          <NativeSelect
            label="First fret"
            value={String(state.firstFret)}
            data={Array.from({ length: state.lastFret + 1 }, (_, f) => ({
              value: String(f),
              label: f === 0 ? "0 (open)" : String(f),
            }))}
            onChange={(event) =>
              change({ firstFret: Number(event.currentTarget.value) })
            }
          />
          <NativeSelect
            label="Last fret"
            value={String(state.lastFret)}
            data={Array.from(
              { length: SCALE_FRET_LIMIT + 1 - Math.max(1, state.firstFret) },
              (_, i) => String(Math.max(1, state.firstFret) + i),
            )}
            onChange={(event) =>
              change({ lastFret: Number(event.currentTarget.value) })
            }
          />
        </SimpleGrid>
      )}
      {state.shapeSet === "standard" && (
        <NativeSelect
          id="scale-linked-pattern"
          label="Link with"
          value={state.linked}
          disabled={state.pattern === "map"}
          data={[
            { value: "none", label: "Single shape" },
            ...SCALE_SHAPES.filter((value) => value !== state.pattern).map(
              (value) => ({ value, label: `Shape ${value}` }),
            ),
          ]}
          onChange={(e) =>
            change({
              linked: e.currentTarget.value as ScaleOptionsSnapshot["linked"],
            })
          }
        />
      )}
      <NativeSelect
        id="scale-dot-labels"
        label="Dots"
        value={
          (state.shapeSet === "hila" || state.pattern === "map") &&
          state.labels === "fingers"
            ? "notes"
            : state.labels
        }
        data={[
          ...(state.shapeSet === "standard" && state.pattern !== "map"
            ? [{ value: "fingers", label: "Finger numbers" }]
            : []),
          { value: "none", label: "Unlabelled dots" },
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
