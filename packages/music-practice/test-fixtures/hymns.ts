import { hymnAvailableArrangements } from "../src/hymn-instruments";
/** Generic UI contracts must not depend on a particular song staying unchanged.
 * Edition tests own named songs. These fixtures select by capabilities and fail
 * early with an actionable message if the product retires a required instrument score.
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

type Requirements = {
  exclude?: string;
  playback?: boolean;
  passage?: boolean;
  recovery?: boolean;
};
const supported = ["piano", "original"];
export function selectPracticeHymn(
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
      !supported.every((id) =>
        hymnAvailableArrangements(hymn).some((arrangement) => arrangement.id === id),
      )
    )
      return false;
    if (recovery) {
      const tracks = abcjs
        .parseOnly(arrangeHymn(hymn, "piano", 0).abc)[0]
        .setUpAudio({ chordsOff: true })
        .tracks.map((track) => track.filter((event) => event.cmd === "note"));
      const first = tracks[0]?.slice(0, 3),
        bass = tracks[1]?.[0];
      if (
        !first ||
        new Set(first.map((note) => note.pitch)).size !== 3 ||
        !bass ||
        bass.start !== 0 ||
        bass.duration <= first[2].start
      )
        return false;
    }
    if (passage) {
      const attacks = abcjs
        .parseOnly(hymn.melody)[0]
        .setUpAudio({ chordsOff: true })
        .tracks[0].filter((event) => event.cmd === "note");
      const barLength = abcjs.parseOnly(hymn.melody)[0].getBarLength();
      if (attacks.length < 36 || attacks.filter(n=>n.start<barLength).length<3 ||
          attacks.filter(n=>n.start>=barLength && n.start<barLength*2).length<2) return false;
    }
    if (!playback) return true;
    const tune = abcjs.parseOnly(hymn.melody)[0];
    const opening = tune.setUpAudio({chordsOff:true}).tracks[0].filter(n=>n.cmd==="note"&&n.start<tune.getBarLength());
    if (tune.getPickupLength() || opening.length < 3) return false;
    const range = hymnPitchRange(hymn.melody);
    return (
      /^K:[A-G](?:b|#)?\s*$/m.test(hymn.melody) &&
      /^M:(?:2|4)\/4\s*$/m.test(hymn.melody) &&
      range.low === 62 &&
      range.high === 74
    );
  });
  if (!hymn)
    throw Error(
      `No ${playback ? "metered D4–D5 octave" : "instrument-score"}${passage ? " with three or more first-bar and two second-bar attacks" : ""}${recovery ? " with three distinct opening notes over sustained bass" : ""} hymn fixture remains. See docs/testing.md: verify the required instrument score and MIDI contracts; do not alter product music or swap an arbitrary song name.`,
    );
  return hymn;
}
export const practiceHymn = selectPracticeHymn(hymns, {playback:true});
export const otherPracticeHymn = selectPracticeHymn(hymns, {
  exclude: practiceHymn.id,
});
// Preserve the range/count-in contracts without assuming a specific tune or
// inventing MIDI pitches. Music correctness is tested independently in units.
export const recoveryHymn = selectPracticeHymn(hymns, { recovery: true });
export const passageHymn = selectPracticeHymn(hymns, {
  playback: true,
  passage: true,
});
export const playbackHymn = selectPracticeHymn(hymns, { playback: true });
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
  .parseOnly(arrangeHymn(playbackHymn, "piano", 0, 0, "both").abc)[0]
  .setUpAudio({ chordsOff: true });
const firstNotes = audio.tracks.map((track) =>
  track.find((event) => event.cmd === "note"),
);
if (firstNotes.length < 2 || firstNotes.some((note) => note?.cmd !== "note"))
  throw Error("Playback fixture requires two sounding hands");
export const playbackMelody = firstNotes[0]!.pitch;
export const playbackBass = firstNotes[1]!.pitch;
export const playbackLeftPitches = audio.tracks[1].flatMap(n=>n.cmd==="note"&&n.start===0?[n.pitch]:[]);
if (playbackMelody === playbackBass)
  throw Error("Playback fixture must distinguish the two hands");

// Generic browser checks use the selected score's attack contract. Exact
// production-song pitches remain the responsibility of unit/edition tests.
export const playbackSourceKey = sourceKey;
export function playbackAttacks(
  arrangement: "piano" | "original" = "piano",
  hymn: Hymn = playbackHymn,
) {
  const audio = abcjs
    .parseOnly(arrangeHymn(hymn, arrangement, 0, 0, arrangement === "piano" ? "right" : "both").abc)[0]
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

export const recoveryMelody = playbackAttacks("piano", recoveryHymn).map(
  (pitches) => pitches[0],
);
export const recoveryBass = abcjs
  .parseOnly(arrangeHymn(recoveryHymn, "piano", 0).abc)[0]
  .setUpAudio({ chordsOff: true })
  .tracks[1].find((event) => event.cmd === "note")!.pitch;

export const recoveryLeftPitches = abcjs.parseOnly(arrangeHymn(recoveryHymn,"piano",0).abc)[0].setUpAudio({chordsOff:true}).tracks[1].flatMap(n=>n.cmd==="note"&&n.start===0?[n.pitch]:[]);
// Written-tie repetition retains independent model coverage and the real piano
// edition witnesses; recovery uses an actual held accompaniment chord.


/** A reviewed guitar score for shared display controls, independent of its title. */
export const guitarEditionHymn = hymns.find(hymn => hymnAvailableArrangements(hymn).some(arrangement => arrangement.id === "guitar-edition"));
if (!guitarEditionHymn) throw Error("The guitar display contract requires a reviewed guitar edition fixture");

// Position formatting is independently covered in passage-selection units; browser
// expectations follow the selected fixture's actual meter and irregular rhythms.
import { scorePosition, positionLabel, passageLabel } from "../src/passage-selection";
const passageTune=abcjs.parseOnly(passageHymn.melody)[0];
const passageNotes=passageTune.setUpAudio({chordsOff:true}).tracks[0].filter(n=>n.cmd==="note");
export const passagePoints=passageNotes.map(n=>scorePosition(n.start,passageTune.getBarLength(),passageTune.getPickupLength(),passageTune.getBeatLength()));
export const passagePointLabel=(index:number)=>positionLabel(passagePoints[index]);
export const passageRangeLabel=(start:number,end:number)=>passageLabel(passagePoints,{start,end});
export const passageSecondBar=passagePoints.flatMap((point,index)=>point.bar===2?[index]:[]);

/** A real written LH continuation, selected independently of the recovery opening. */
function writtenTiePlan(hymn:Hymn) {
  const tune=abcjs.parseOnly(arrangeHymn(hymn,"piano",0).abc)[0];tune.setUpAudio({chordsOff:true});
  const voices=new Map<string,{time:number; pitches:Map<number,number>}>(),groups=new Map<number,{pitches:number[];leftTies:number[]}>();
  for(const line of tune.lines)for(const[si,staff]of(line.staff||[]).entries())for(const[vi,voice]of(staff.voices||[]).entries()){
    const id=`${si}:${vi}`,state=voices.get(id)||{time:0,pitches:new Map<number,number>()};
    for(const n of voice)if(n.el_type==="note"){
      const group=groups.get(state.time)||{pitches:[],leftTies:[]};let attack=0;
      for(const p of n.pitches||[]){const midi=p.endTie?state.pitches.get(p.pitch):n.midiPitches?.[attack++]?.pitch;
        if(midi!==undefined){state.pitches.set(p.pitch,midi);group.pitches.push(midi);if(p.endTie&&si===1)group.leftTies.push(midi);}}
      if(group.pitches.length)groups.set(state.time,group);state.time+=n.duration;
    }
    voices.set(id,state);
  }
  const steps=[...groups].sort((a,b)=>a[0]-b[0]).map(([time,group])=>({time,pitches:[...new Set(group.pitches)],leftTies:group.leftTies}));
  const index=steps.findIndex(step=>step.leftTies.length>0);
  return index>0?{hymn,steps,index,bass:steps[index].leftTies[0]}:undefined;
}
export const pianoTieFixture=hymns.map(writtenTiePlan).find(Boolean)!;
if(!pianoTieFixture)throw Error("Written-tie repetition requires a real piano continuation");
