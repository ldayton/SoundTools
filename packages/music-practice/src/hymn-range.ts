import abcjs from "abcjs";
import { spellPitch, chromaticPitch } from "./guitar";
import { name } from "./model";
import { HYMN_KEYS, hymnTransposition, type HymnKey } from "./hymn-transpose";
export type HymnRange = { low: number; high: number };
/** Read actual sounding pitches: clefs, ties, accidentals and every voice count. */
export function hymnPitchRange(abc: string): HymnRange {
  const tune = abcjs.parseOnly(abc)[0];
  if (!tune || tune.warnings?.length) throw Error("Cannot read hymn range");
  const notes = tune
    .setUpAudio({ chordsOff: true })
    .tracks.flatMap((track) =>
      track.flatMap((event) => (event.cmd === "note" ? [event.pitch] : [])),
    );
  if (!notes.length) throw Error("Hymn has no playable notes");
  return { low: Math.min(...notes), high: Math.max(...notes) };
}
/** Use the key's diatonic spellings, including E-sharp in F-sharp major. */
export function hymnRangeLabel(
  range: HymnRange,
  source: string,
  target: HymnKey = "original",
) {
  const { key, semitones } = hymnTransposition(source, target);
  const label = (pitch: number) => {
    const note =
      spellPitch(pitch + semitones, key) || chromaticPitch(pitch + semitones);
    return name(note) + note.octave;
  };
  return `${label(range.low)}–${label(range.high)}`;
}
/** Key order is by sounding register, not alphabetical key name. */
export function hymnRangeKeys(
  source: string,
  range: HymnRange | undefined,
  low: number | null,
  high: number | null,
) {
  const choices = (["original", ...HYMN_KEYS] as HymnKey[]).map((key) => {
    try {
      const { semitones } = hymnTransposition(source, key);
      const fits =
        (low === null || high === null || low <= high) &&
        (low === null || (!!range && range.low + semitones >= low)) &&
        (high === null || (!!range && range.high + semitones <= high));
      return { key, semitones, fits };
    } catch {
      return { key, semitones: 0, fits: false };
    }
  });
  const matching = choices
    .filter((c) => c.fits)
    .sort((a, b) => a.semitones - b.semitones);
  return {
    choices,
    preferred: choices[0].fits ? ("original" as HymnKey) : matching[0]?.key,
  };
}
