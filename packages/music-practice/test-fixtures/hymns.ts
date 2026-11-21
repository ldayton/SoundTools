/** Generic UI contracts must not depend on a particular song staying unchanged.
 * Edition tests own named songs. These fixtures select by capabilities and fail
 * early with an actionable message if the product retires staged arrangements.
 * Never change a product edition to satisfy a generic fixture requirement.
 */
import abcjs from "abcjs";
import hymns from "../src/hymns.json";
import { hymnArrangements, arrangeHymn, type Hymn } from "../src/hymn-arrangements";
import { hymnPitchRange, hymnRangeLabel, hymnRangeKeys } from "../src/hymn-range";
import type { HymnKey } from "../src/hymn-transpose";

type Requirements = { exclude?: string; playback?: boolean };
const staged = ["melody", "bass", "chords", "broken", "original"];
export function selectStagedHymn(catalog: Hymn[] = hymns, { exclude, playback = false }: Requirements = {}) {
  const hymn = catalog.find(hymn => {
    if (hymn.id === exclude || hymn.stanzas.length < 2 ||
      !staged.every(id => hymnArrangements(hymn).some(arrangement => arrangement.id === id))) return false;
    if (!playback) return true;
    const range = hymnPitchRange(hymn.melody);
    return /^K:[A-G](?:b|#)?\s*$/m.test(hymn.melody) && /^M:4\/4\s*$/m.test(hymn.melody) && range.low === 62 && range.high === 74;
  });
  if (!hymn) throw Error(`No ${playback ? 'metered D4–D5 octave' : 'staged-arrangement'} hymn fixture remains. See docs/testing.md: migrate the generic contract if staged controls were retired; do not alter product music or swap an arbitrary song name.`);
  return hymn;
}
export const stagedHymn = selectStagedHymn();
export const otherStagedHymn = selectStagedHymn(hymns, { exclude: stagedHymn.id });
// Preserve the range/count-in contracts without assuming a specific tune or
// inventing MIDI pitches. Music correctness is tested independently in units.
export const playbackHymn = selectStagedHymn(hymns, { playback: true });
const playbackRange = hymnPitchRange(playbackHymn.melody);
const sourceKey = playbackHymn.melody.match(/^K:([A-G](?:b|#)?)\s*$/m)![1];
// These model results are unit-tested separately. Browser checks verify that
// actual controls apply and display them; they do not re-test pitch arithmetic.
export const playbackRangeLabel = (key: HymnKey) => hymnRangeLabel(playbackRange, sourceKey, key);
export const playbackFittedKey = hymnRangeKeys(sourceKey, playbackRange, 60, 72).preferred!;
if (!playbackFittedKey) throw Error('Playback fixture must fit exactly into C4–C5 in one key');
const audio = abcjs.parseOnly(arrangeHymn(playbackHymn, "bass", 0, 0, "both").abc)[0].setUpAudio({ chordsOff: true });
const firstNotes = audio.tracks.map(track => track.find(event => event.cmd === "note"));
if (firstNotes.length < 2 || firstNotes.some(note => note?.cmd !== "note")) throw Error('Playback fixture requires two sounding hands');
export const playbackMelody = firstNotes[0]!.pitch;
export const playbackBass = firstNotes[1]!.pitch;
if (playbackMelody === playbackBass) throw Error('Playback fixture must distinguish the two hands');
