import {MAQAMAT, MAQAM_QUALITIES, isMaqam} from "./maqamat";
import { BERKLEE_SHAPES, type BerkleeShape } from "./berklee-scale-shapes";
import { useSyncExternalStore } from "react";
import { NativeSelect, Stack, SimpleGrid } from "@mantine/core";
import { CAGED_SHAPES, scaleShapeLabel, type ScalePattern } from "./guitar-scale-patterns";
import {
  SCALE_FRET_LIMIT,
  SCALE_TONICS,
  scaleLabel,
  type ScaleQuality,
} from "./guitar-scales";
import { createViewState } from "./view-state";
export type ScaleOptionsSnapshot = {
  shapeSet: "standard" | "hila";
  hilaShape: BerkleeShape;
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
        data={[{group:"Scales", items:[
          { value: "major", label: "Major" },
          { value: "minor", label: "Natural minor" },
          { value: "major-pentatonic", label: "Major pentatonic" },
          { value: "minor-pentatonic", label: "Minor pentatonic" },
          { value: "major-blues", label: "Major blues" },
          { value: "minor-blues", label: "Minor blues" },
        ]}, {group:"Maqamat",items:MAQAM_QUALITIES.map(value=>({value,label:MAQAMAT[value].name}))}]}
        onChange={(e) =>
          change({ quality: e.currentTarget.value as ScaleQuality })
        }
      />
      {!isMaqam(state.quality) && (
        <NativeSelect
          label="Shape set"
          value={state.shapeSet}
          data={[
            { value: "hila", label: "Berklee 7PS" },
            { value: "standard", label: "CAGED · five shapes" },
          ]}
          onChange={(e) =>
            change({ shapeSet: e.currentTarget.value as "standard" | "hila" })
          }
        />
      )}
      {isMaqam(state.quality) ? <NativeSelect label="Hand position" value={String(state.firstFret)} data={Array.from({length:14},(_,i)=>({value:String(i+1),label:`Frets ${i+1}–${i+5}`}))} onChange={e=>change({firstFret:Number(e.currentTarget.value)})} /> : state.shapeSet === "hila" ? (
        <NativeSelect
          label="Shape"
          value={String(state.hilaShape)}
          data={BERKLEE_SHAPES.map((n) => ({
            value: String(n),
            label: `Shape ${n}`,
          }))}
          onChange={(e) =>
            change({ hilaShape: Number(e.currentTarget.value) as BerkleeShape })
          }
        />
      ) : (
        <NativeSelect
          id="scale-pattern"
          label="Pattern"
          value={state.pattern}
          data={[
            { value: "map", label: "Fret range" },
            ...CAGED_SHAPES.map((value) => ({
              value,
              label: scaleShapeLabel(value, state.quality),
            })),
          ]}
          onChange={(e) =>
            change({ pattern: e.currentTarget.value as ScalePattern })
          }
        />
      )}
      {!isMaqam(state.quality) && state.shapeSet === "standard" && state.pattern === "map" && (
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
      {!isMaqam(state.quality) && state.shapeSet === "standard" && (
        <NativeSelect
          id="scale-linked-pattern"
          label="Link with"
          value={state.linked}
          disabled={state.pattern === "map"}
          data={[
            { value: "none", label: "Single shape" },
            ...CAGED_SHAPES.filter((value) => value !== state.pattern).map(
              (value) => ({ value, label: scaleShapeLabel(value, state.quality) }),
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
          !isMaqam(state.quality) && (state.shapeSet === "hila" || state.pattern === "map") &&
          state.labels === "fingers"
            ? "notes"
            : state.labels
        }
        data={[
          ...(state.shapeSet === "standard" && (state.pattern !== "map" || isMaqam(state.quality))
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
