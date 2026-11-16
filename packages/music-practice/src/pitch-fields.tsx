import { SimpleGrid } from "@mantine/core";
import { ResponsivePitchField } from "@ldayton/ui/responsive-pitch-field";
import { HYMN_NOTE_MIN, HYMN_NOTE_MAX } from "./hymn-settings";
import { selectableNoteLabel } from "./pitch-labels";

const choices = (positions: readonly string[], chromatic = false) =>
  positions.map((label, value) => {
    const [, letter, octave] = /^(.*?)(-?\d+)$/.exec(label)!;
    return {
      value,
      label,
      octave: Number(octave),
      column: (chromatic
        ? ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
        : [..."CDEFGAB"]
      ).indexOf(letter),
    };
  });
export function WrittenPitchRange({
  id,
  ids,
  positions,
  low,
  high,
  onChange,
  hidden = false,
}: {
  id?: string;
  ids: readonly [string, string];
  positions: readonly string[];
  low: string;
  high: string;
  onChange(bound: "low" | "high", value: string): void;
  hidden?: boolean;
}) {
  return (
    <SimpleGrid
      id={id}
      cols={2}
      hidden={hidden}
      role="group"
      aria-label="Pitch range"
    >
      {(["low", "high"] as const).map((bound, index) => (
        <ResponsivePitchField
          key={bound}
          id={ids[index]}
          label={`${index ? "Highest" : "Lowest"} note`}
          columns={7}
          value={positions.indexOf(bound === "low" ? low : high)}
          choices={choices(positions).map((choice) => ({
            ...choice,
            disabled: index
              ? choice.value < positions.indexOf(low)
              : choice.value > positions.indexOf(high),
          }))}
          onChange={(value) => onChange(bound, positions[value])}
        />
      ))}
    </SimpleGrid>
  );
}
const hymnPositions = Array.from(
  { length: HYMN_NOTE_MAX - HYMN_NOTE_MIN + 1 },
  (_, index) => selectableNoteLabel(index + HYMN_NOTE_MIN),
);
const hymnChoices = choices(hymnPositions, true);
export function HymnPitchField({
  bound,
  value,
  onChange,
}: {
  bound: "low" | "high";
  value: number | null;
  onChange(value: number | null): void;
}) {
  return (
    <ResponsivePitchField
      id={`hymn-${bound}`}
      label={`${bound === "low" ? "Lowest" : "Highest"} note`}
      displayLabel={bound === "low" ? "Lowest" : "Highest"}
      choices={hymnChoices}
      value={value === null ? -1 : value - HYMN_NOTE_MIN}
      optional
      mobileWheel
      onChange={(index) => onChange(index < 0 ? null : index + HYMN_NOTE_MIN)}
    />
  );
}
