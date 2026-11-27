import {MAQAMAT, MAQAM_QUALITIES, isMaqam} from "./maqamat";
import { BERKLEE_SHAPES, type BerkleeShape, type LinkedScaleShape } from "./berklee-scale-shapes";
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
  linked: LinkedScaleShape;
  wholeRoute: boolean;
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
    <Stack
      className="soundtools-ui scale-options"
      role="group"
      aria-label="Scale controls"
      tabIndex={-1}
      onChange={(event) => {
        // A committed selection hands arrows back to the scale shortcuts. Keep
        // focus inside the phone drawer, without scrolling or adding a Tab stop.
        if (event.target instanceof HTMLSelectElement)
          event.currentTarget.focus({ preventScroll: true });
      }}
    >
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
            { value: "standard", label: "CAGED" },
            { value: "hila", label: "Berklee 7PS" },
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
      ) : !state.wholeRoute && (
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
      {!isMaqam(state.quality) && state.shapeSet === "standard" && state.pattern === "map" && !state.wholeRoute && (
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
      {!isMaqam(state.quality) && (
        <NativeSelect
          id="scale-linked-pattern"
          label="Link with"
          value={state.wholeRoute ? 'all' : state.linked}
          data={[
            { value: "none", label: "Single shape" },
            ...(state.shapeSet==='standard'?[{value:'all',label:'All five shapes'}]:[]),
            ...(state.shapeSet === "hila"
              ? BERKLEE_SHAPES.filter(value=>value!==state.hilaShape).map(value=>({value:String(value),label:`Shape ${value}`}))
              : CAGED_SHAPES.filter((value) => value !== state.pattern && state.pattern !== 'map').map(
              (value) => ({ value, label: scaleShapeLabel(value, state.quality) }),
            )),
          ]}
          onChange={(e) =>
            change({
              wholeRoute:e.currentTarget.value==='all',
              linked: e.currentTarget.value==='all'?'none':e.currentTarget.value as ScaleOptionsSnapshot["linked"],
            })
          }
        />
      )}
      <NativeSelect
        id="scale-dot-labels"
        label="Dots"
        value={
          !state.wholeRoute && !isMaqam(state.quality) && state.shapeSet === "standard" && state.pattern === "map" &&
          state.labels === "fingers"
            ? "notes"
            : state.labels
        }
        data={[
          ...(state.wholeRoute || state.shapeSet === "hila" || state.pattern !== "map" || isMaqam(state.quality)
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
