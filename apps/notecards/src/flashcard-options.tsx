import { useSyncExternalStore } from "react";
import {
  Box,
  Checkbox,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import type { FlashcardMode } from "./exercises";
import type { Profile } from "./exercise-settings";
import { KEYS, ROUND_LENGTHS, type RoundLength } from "./model";
import { STRINGS } from "./guitar";
import { WrittenPitchRange } from "./pitch-fields";
import { PIANO_POSITIONS } from "./piano-model";
import { POSITIONS } from "./model";
import { createViewState } from "./view-state";
export type FlashcardOptionsSnapshot = {
  mode: FlashcardMode | null;
  profile: Profile;
  roundLength: RoundLength;
  rangeNotice: string;
};
export const flashcardOptionsState = createViewState<FlashcardOptionsSnapshot>;
export type FlashcardOptionsState = ReturnType<typeof flashcardOptionsState>;
const keys = KEYS.map((key) => ({
  value: key.id,
  label: key.label.replace(/ ·.*$/, ""),
}));
const frets = Array.from({ length: 13 }, (_, n) => ({
  value: String(n),
  label: n === 0 ? "0 · Open" : String(n),
}));
export function FlashcardOptions({
  model,
  change,
  roundLengthChanged,
}: {
  model: FlashcardOptionsState;
  change(patch: Partial<Profile>): void;
  roundLengthChanged(length: RoundLength): void;
}) {
  const {
    mode,
    profile: p,
    roundLength,
    rangeNotice,
  } = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const piano = mode === "piano",
    signature = mode === "signature";
  const guitar =
    mode !== null && !["staff", "piano", "signature"].includes(mode);
  return (
    <Stack className="soundtools-ui">
      <NativeSelect
        id="roundLength"
        label="Cards per round"
        value={String(roundLength)}
        data={ROUND_LENGTHS.map((n) => String(n))}
        onChange={(e) =>
          roundLengthChanged(Number(e.currentTarget.value) as RoundLength)
        }
      />
      <Box id="key-setting" hidden={mode === "name" || signature}>
        <NativeSelect
          id="key"
          label="Key"
          data={keys}
          value={p.key}
          onChange={(e) => change({ key: e.currentTarget.value })}
        />
      </Box>
      {signature && (
        <>
          <NativeSelect
            id="signaturePractice"
            label="Keys"
            value={p.signaturePractice || "major"}
            data={[
              { value: "major", label: "Major only" },
              { value: "minor", label: "Minor only" },
              { value: "both", label: "Major & minor" },
            ]}
            onChange={(e) =>
              change({
                signaturePractice: e.currentTarget
                  .value as Profile["signaturePractice"],
              })
            }
          />
          <NativeSelect
            id="signatureMaxAccidentals"
            label="Maximum sharps / flats"
            value={String(p.signatureMaxAccidentals ?? 1)}
            data={Array.from({ length: 8 }, (_, n) => ({
              value: String(n),
              label: n === 0 ? "None" : `Up to ${n}`,
            }))}
            onChange={(e) =>
              change({ signatureMaxAccidentals: Number(e.currentTarget.value) })
            }
          />
          <NativeSelect
            id="signatureAccidentals"
            label="Include"
            value={p.signatureAccidentals || "both"}
            data={[
              { value: "both", label: "Sharps & flats" },
              { value: "sharps", label: "Sharps only" },
              { value: "flats", label: "Flats only" },
            ]}
            onChange={(e) =>
              change({
                signatureAccidentals: e.currentTarget
                  .value as Profile["signatureAccidentals"],
              })
            }
          />
        </>
      )}
      {mode === "name" && (
        <NativeSelect
          id="nameNotes"
          label="Notes"
          value={p.naturalsOnly ? "naturals" : "all"}
          data={[
            { value: "all", label: "All notes" },
            { value: "naturals", label: "Naturals" },
          ]}
          onChange={(e) =>
            change({ naturalsOnly: e.currentTarget.value === "naturals" })
          }
        />
      )}
      <Stack id="piano-notation-options" hidden={!piano}>
        <NativeSelect
          id="staffLayout"
          label="Staff layout"
          value={p.staffLayout || "grand"}
          data={[
            { value: "treble", label: "Treble" },
            { value: "bass", label: "Bass" },
            { value: "grand", label: "Grand staff" },
          ]}
          onChange={(e) =>
            change({
              staffLayout: e.currentTarget.value as Profile["staffLayout"],
            })
          }
        />
        <Box id="overlap-setting" hidden={p.staffLayout !== "grand"}>
          <NativeSelect
            id="overlapPractice"
            label="Overlapping notes"
            value={p.overlapPractice || "standard"}
            data={[
              { value: "standard", label: "Standard" },
              { value: "both", label: "Both clefs" },
            ]}
            onChange={(e) =>
              change({
                overlapPractice: e.currentTarget
                  .value as Profile["overlapPractice"],
              })
            }
          />
        </Box>
        <NativeSelect
          id="octavePractice"
          label="Octave markings"
          value={p.octavePractice || "off"}
          data={[
            { value: "off", label: "Off" },
            { value: "practice", label: "8va / 8vb" },
          ]}
          onChange={(e) =>
            change({
              octavePractice: e.currentTarget
                .value as Profile["octavePractice"],
            })
          }
        />
        <Text
          size="sm"
          c="dimmed"
          className="notation-help"
          hidden={p.octavePractice !== "practice"}
        >
          8va: play an octave higher. 8vb: play an octave lower.
        </Text>
      </Stack>
      <WrittenPitchRange
        id="pitch-range"
        ids={["staff-low-spin", "staff-high-spin"]}
        positions={POSITIONS}
        low={p.low}
        high={p.high}
        hidden={mode !== "staff"}
        onChange={(bound, value) => change({ [bound]: value })}
      />
      <WrittenPitchRange
        id="piano-range"
        ids={["low-spin", "high-spin"]}
        positions={PIANO_POSITIONS}
        low={p.low}
        high={p.high}
        hidden={!piano}
        onChange={(bound, value) => change({ [bound]: value })}
      />
      <Text
        id="piano-range-notice"
        size="sm"
        c="dimmed"
        hidden={!piano || !rangeNotice}
      >
        {rangeNotice}
      </Text>
      <Stack id="guitar-options" hidden={!guitar}>
        <Checkbox.Group
          id="guitar-strings"
          label="Strings"
          value={p.strings.map(String)}
          onChange={(values) => change({ strings: values.map(Number) })}
        >
          <SimpleGrid cols={3} mt="xs">
            {[...STRINGS].reverse().map((string) => (
              <Checkbox
                key={string.number}
                id={`guitar-string-${string.number}`}
                value={String(string.number)}
                label={`${string.number} · ${string.name.replace(/^(Low|High) /, "")}`}
                aria-label={`String ${string.number}, ${string.name}`}
                data-string-toggle={string.number}
                disabled={
                  p.strings.length === 1 && p.strings.includes(string.number)
                }
              />
            ))}
          </SimpleGrid>
        </Checkbox.Group>
        <SimpleGrid cols={2}>
          <NativeSelect
            id="minFret"
            label="Lowest fret"
            value={String(p.minFret)}
            data={frets.map((fret) => ({
              ...fret,
              disabled: Number(fret.value) > p.maxFret,
            }))}
            onChange={(e) => change({ minFret: Number(e.currentTarget.value) })}
          />
          <NativeSelect
            id="maxFret"
            label="Highest fret"
            value={String(p.maxFret)}
            data={frets.map((fret) => ({
              ...fret,
              disabled: Number(fret.value) < p.minFret,
            }))}
            onChange={(e) => change({ maxFret: Number(e.currentTarget.value) })}
          />
        </SimpleGrid>
      </Stack>
    </Stack>
  );
}
