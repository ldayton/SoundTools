import { hymnAvailableArrangements } from "../src/hymn-instruments";
/** Generic UI contracts must not depend on a particular song staying unchanged.
 * Edition tests own named songs. These fixtures select by capabilities and fail
 * early with an actionable message if the product retires staged arrangements.
 * Never change a product edition to satisfy a generic fixture requirement.
 */
import abcjs from "abcjs";
import hymns from "../src/hymns.json";
import {
  arrangeHymn,
  type Hymn,
} from "../src/hymn-arrangements";
import {
  hymnPitchRange,
  hymnRangeLabel,
  hymnRangeKeys,
} from "../src/hymn-range";
import type { HymnKey } from "../src/hymn-transpose";

function continuationIndex(hymn: Hymn) {
  const tune = abcjs.parseOnly(arrangeHymn(hymn, "bass", 0).abc)[0];
  const tracks = tune
    .setUpAudio({ chordsOff: true })
    .tracks.map((track) => track.filter((event) => event.cmd === "note"));
  const bass = tracks[1]?.[0];
  if (!bass || !tracks[0]) return -1;
  let time = 0;
  for (const line of tune.lines)
    for (const item of line.staff?.[1]?.voices?.[0] || []) {
      if (item.el_type !== "note") continue;
      if (
        time > 0 &&
        time < bass.duration &&
        item.pitches?.some((pitch) => pitch.endTie)
      ) {
        const index = tracks[0].findIndex(
          (note) => Math.abs(note.start - time) < 1e-8,
        );
        if (index > 0) return index;
      }
      time += item.duration || 0;
    }
  return -1;
}

type Requirements = {
  exclude?: string;
  playback?: boolean;
  passage?: boolean;
  recovery?: boolean;
};
const staged = ["melody", "bass", "chords", "broken", "original"];
export function selectStagedHymn(
  catalog: Hymn[] = hymns,
  {
    exclude,
    playback = false,
    passage = false,
    recovery = false,
  }: Requirements = {},
) {
  const hymn = catalog.find((hymn) => {
    if (
      hymn.id === exclude ||
      hymn.stanzas.length < 2 ||
      !staged.every((id) =>
        hymnAvailableArrangements(hymn).some((arrangement) => arrangement.id === id),
      )
    )
      return false;
    if (recovery) {
      const tracks = abcjs
        .parseOnly(arrangeHymn(hymn, "bass", 0).abc)[0]
        .setUpAudio({ chordsOff: true })
        .tracks.map((track) => track.filter((event) => event.cmd === "note"));
      const first = tracks[0]?.slice(0, 3),
        bass = tracks[1]?.[0];
      if (
        !first ||
        new Set(first.map((note) => note.pitch)).size !== 3 ||
        !bass ||
        bass.start !== 0 ||
        bass.duration <= first[2].start ||
        continuationIndex(hymn) < 1
      )
        return false;
    }
    if (passage) {
      const attacks = abcjs
        .parseOnly(hymn.melody)[0]
        .setUpAudio({ chordsOff: true })
        .tracks[0].filter((event) => event.cmd === "note");
      // Passage gestures select four attacks in bar 1 and two in bar 2.
      if (
        ![0, 0.25, 0.5, 0.75, 1, 1.5].every(
          (start, i) => attacks[i]?.start === start,
        )
      )
        return false;
    }
    if (!playback) return true;
    const range = hymnPitchRange(hymn.melody);
    return (
      /^K:[A-G](?:b|#)?\s*$/m.test(hymn.melody) &&
      /^M:4\/4\s*$/m.test(hymn.melody) &&
      range.low === 62 &&
      range.high === 74
    );
  });
  if (!hymn)
    throw Error(
      `No ${playback ? "metered D4–D5 octave" : "staged-arrangement"}${passage ? " with four first-bar and two second-bar attacks" : ""}${recovery ? " with three distinct opening notes over sustained bass" : ""} hymn fixture remains. See docs/testing.md: migrate the generic contract if staged controls were retired; do not alter product music or swap an arbitrary song name.`,
    );
  return hymn;
}
export const stagedHymn = selectStagedHymn();
export const otherStagedHymn = selectStagedHymn(hymns, {
  exclude: stagedHymn.id,
});
// Preserve the range/count-in contracts without assuming a specific tune or
// inventing MIDI pitches. Music correctness is tested independently in units.
export const recoveryHymn = selectStagedHymn(hymns, { recovery: true });
export const passageHymn = selectStagedHymn(hymns, {
  playback: true,
  passage: true,
});
export const playbackHymn = selectStagedHymn(hymns, { playback: true });
const playbackRange = hymnPitchRange(playbackHymn.melody);
const sourceKey = playbackHymn.melody.match(/^K:([A-G](?:b|#)?)\s*$/m)![1];
// These model results are unit-tested separately. Browser checks verify that
// actual controls apply and display them; they do not re-test pitch arithmetic.
export const playbackRangeLabel = (key: HymnKey) =>
  hymnRangeLabel(playbackRange, sourceKey, key);
export const playbackFittedKey = hymnRangeKeys(
  sourceKey,
  playbackRange,
  60,
  72,
).preferred!;
if (!playbackFittedKey)
  throw Error("Playback fixture must fit exactly into C4–C5 in one key");
const audio = abcjs
  .parseOnly(arrangeHymn(playbackHymn, "bass", 0, 0, "both").abc)[0]
  .setUpAudio({ chordsOff: true });
const firstNotes = audio.tracks.map((track) =>
  track.find((event) => event.cmd === "note"),
);
if (firstNotes.length < 2 || firstNotes.some((note) => note?.cmd !== "note"))
  throw Error("Playback fixture requires two sounding hands");
export const playbackMelody = firstNotes[0]!.pitch;
export const playbackBass = firstNotes[1]!.pitch;
if (playbackMelody === playbackBass)
  throw Error("Playback fixture must distinguish the two hands");

// Generic browser checks use the selected score's attack contract. Exact
// production-song pitches remain the responsibility of unit/edition tests.
export const playbackSourceKey = sourceKey;
export function playbackAttacks(
  arrangement: "melody" | "original" = "melody",
  hymn: Hymn = playbackHymn,
) {
  const audio = abcjs
    .parseOnly(arrangeHymn(hymn, arrangement, 0, 0, "both").abc)[0]
    .setUpAudio({ chordsOff: true });
  const events = new Map<number, number[]>();
  for (const track of audio.tracks)
    for (const event of track)
      if (event.cmd === "note") {
        const pitches = events.get(event.start) || [];
        pitches.push(event.pitch);
        events.set(event.start, pitches);
      }
  return [...events]
    .sort(([a], [b]) => a - b)
    .map(([, pitches]) => [...new Set(pitches)].sort((a, b) => a - b));
}

export const recoveryMelody = playbackAttacks("melody", recoveryHymn).map(
  (pitches) => pitches[0],
);
export const recoveryBass = abcjs
  .parseOnly(arrangeHymn(recoveryHymn, "bass", 0).abc)[0]
  .setUpAudio({ chordsOff: true })
  .tracks[1].find((event) => event.cmd === "note")!.pitch;

export const recoveryTieIndex = continuationIndex(recoveryHymn);

/** A reviewed guitar score for shared display controls, independent of its title. */
export const guitarEditionHymn = hymns.find(hymn => hymnAvailableArrangements(hymn).some(arrangement => arrangement.id === "guitar-edition"));
if (!guitarEditionHymn) throw Error("The guitar display contract requires a reviewed guitar edition fixture");
