import abcjs from "abcjs";
import { spellPitch, chromaticPitch } from "./guitar";
import { name } from "./model";
import { HYMN_KEYS, hymnTransposition, type HymnKey } from "./hymn-transpose";
import { HYMN_NOTE_MIN, HYMN_NOTE_MAX } from "./hymn-settings";
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
  octave = 0,
) {
  const { key, semitones } = hymnTransposition(source, target, octave);
  const label = (pitch: number) => {
    const note =
      spellPitch(pitch + semitones, key) || chromaticPitch(pitch + semitones);
    return name(note) + note.octave;
  };
  return `${label(range.low)}–${label(range.high)}`;
}
export type HymnRangeChoices={choices:{key:HymnKey;semitones:number;octave:number|undefined;octaves:number[];fits:boolean;range:string}[];preferred:HymnKey|undefined};
/** Key order is by sounding register, not alphabetical key name. */
export function hymnRangeKeys(
  source: string,
  range: HymnRange | undefined,
  low: number | null,
  high: number | null,
  instrumentTranspose?: { min: number; max: number },
):HymnRangeChoices {
  const choices = (["original", ...HYMN_KEYS] as HymnKey[]).map((key) => {
    try {
      const { semitones } = hymnTransposition(source, key);
      const minimum = low ?? HYMN_NOTE_MIN;
      const maximum = high ?? HYMN_NOTE_MAX;
      const octaves = range
        ? Array.from({ length: 21 }, (_, i) => i - 10).filter(
            (octave) =>
              range.low + semitones + octave * 12 >= minimum &&
              range.high + semitones + octave * 12 <= maximum &&
              (!instrumentTranspose || (
                semitones + octave * 12 >= instrumentTranspose.min &&
                semitones + octave * 12 <= instrumentTranspose.max
              )),
          )
        : low === null && high === null
          ? [0]
          : [];
      const octave =
        low === null && high === null && octaves.includes(0) ? 0 : octaves[0];
      // Excluded keys still need a useful preview: place their lowest note at
      // or above the lower limit (or C2), even when the upper note cannot fit.
      const previewOctave =
        octave ??
        (range ? Math.ceil((minimum - range.low - semitones) / 12) : 0);
      return {
        key,
        semitones: semitones + (octave ?? 0) * 12,
        octave,
        octaves,
        fits: octaves.length > 0,
        range: range ? hymnRangeLabel(range, source, key, previewOctave) : "",
      };
    } catch {
      return {
        key,
        semitones: 0,
        octave: undefined,
        octaves: [] as number[],
        fits: false,
        range: "",
      };
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
