import hymns from "./hymns.json";
import {
  hymnArrangements,
  isGuitarArrangement,
  type Arrangement,
} from "./hymn-arrangements";
export type HymnInstrument = "guitar" | "piano" | "sung";
export const hymnInstrumentChoices = [
  { id: "guitar", label: "Guitar", icon: "guitar" },
  { id: "piano", label: "Piano", icon: "keyboard" },
  { id: "sung", label: "Voice + Piano", icon: "microphone" },
] as const;
/** Existing arrangement IDs remain the persisted/deep-link contract. */
export function hymnInstrument(arrangement: Arrangement): HymnInstrument {
  return isGuitarArrangement(arrangement)
    ? "guitar"
    : arrangement === "original"
      ? "sung"
      : "piano";
}
export function hymnInstrumentArrangements(
  hymn: { id: string },
  instrument: HymnInstrument,
) {
  const entry = hymns.find((h) => h.id === hymn.id);
  const printedScore = entry?.source === "user-supplied-score";
  return hymnArrangements(hymn).filter(
    (arrangement) =>
      hymnInstrument(arrangement.id) === instrument &&
      (!printedScore || instrument === "sung"),
  );
}
export function hymnAvailableArrangements(hymn: { id: string }) {
  return hymnInstrumentChoices.flatMap((instrument) =>
    hymnInstrumentArrangements(hymn, instrument.id),
  );
}
export function selectHymnInstrument(
  hymn: { id: string },
  current: Arrangement,
  instrument: HymnInstrument,
) {
  const available = hymnInstrumentArrangements(hymn, instrument);
  return (
    available.find((arrangement) => arrangement.id === current)?.id ??
    available[0]?.id
  );
}
