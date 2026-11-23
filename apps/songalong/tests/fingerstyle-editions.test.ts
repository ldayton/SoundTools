import { hymnRangeKeys } from "../../../packages/music-practice/src/hymn-range";
import { hymnTransposition } from "../../../packages/music-practice/src/hymn-transpose";
import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import { arrangeHymn, hymnArrangements } from "../../../packages/music-practice/src/hymn-arrangements";
import { hymnPreferences, hymnSettingsFromQuery } from "../../../packages/music-practice/src/hymn-settings";
import { fingerstylePosition } from "../../../packages/music-practice/src/fingerstyle-tab";
const hymn = hymns.find(h => h.slug === "the-1st-fingerstyle-blues")!;
function read(abc: string) {
 const tune = abcjs.parseOnly(abc)[0];
 assert.equal(tune.warnings?.length || 0,0);
 const audio=tune.setUpAudio({qpm:60,chordsOff:true});
 return {tune,audio,notes:audio.tracks.flatMap(track=>track.flatMap(n=>n.cmd==='note' ? [[n.pitch,n.start,n.duration]] : []))
  .sort((a,b)=>a[1]-b[1]||a[0]-b[0])};
}
test("this song has exactly two instrument arrangements and migrates old choices", () => {
 assert.deepEqual(hymnArrangements(hymn).map(a=>[a.id,a.label]),[["piano","Piano"],["guitar-fingerstyle","Guitar"]]);
 assert.equal(hymnPreferences(hymn.id).arrangement,"piano");
 for (const arrangement of ["melody","bass","chords","broken","original"])
  assert.equal(hymnPreferences(hymn.id,{arrangement}).arrangement,"piano");
 for (const arrangement of ["guitar","guitar-chords","guitar-fingerstyle"])
  assert.equal(hymnPreferences(hymn.id,{arrangement}).arrangement,"guitar-fingerstyle");
 const base=hymnPreferences(hymn.id,{arrangement:"guitar-fingerstyle",hands:"left",scoreDisplay:"tab"});
 const next=hymnSettingsFromQuery(base,new URLSearchParams('arrangement=piano&display=notation'));
 assert.equal(next.arrangement,'piano');assert.equal(next.hands,'left');assert.equal(next.scoreDisplay,'notation');
 assert.equal(hymnPreferences(hymn.id,{...base,arrangement:'piano'}).scoreDisplay,'tab');
 assert.equal(hymnPreferences('ill-fly-away').arrangement,'piano');
});
test("piano has a grand staff; guitar preserves the original voices; piano avoids an octave stretch in the final chord", () => {
 const original=read(hymn.harmony);
 for(const arrangement of ['piano','guitar-fingerstyle'] as const) {
  const score=arrangeHymn(hymn,arrangement,0);
  const {tune,audio,notes}=read(score.abc);
  const expected=arrangement==='piano' ? original.notes.filter(n=>!(n[0]===52 && n[1]===24)) : original.notes;
  assert.deepEqual(notes,expected,arrangement);
  assert.equal(audio.totalDuration,25);
  assert.match(score.abc,/Q:"Swing"/);assert.doesNotMatch(score.abc,/\(3/);
  if(arrangement==='piano') assert.deepEqual(tune.lines[0].staff?.map(s=>s.clef?.type),['treble','bass']);
  else {assert.equal(tune.lines[0].staff?.length,1);assert.equal(tune.lines[0].staff?.[0]?.clef?.type,'treble-8');assert.equal(tune.lines[0].staff?.[0]?.voices?.length,2);}
  for(const hands of ['right','left'] as const) {
   const part=read(arrangeHymn(hymn,arrangement,0,0,hands).abc);
   const track = original.audio.tracks[hands === 'right' ? 0 : 1];
   let expected = track.flatMap(n => n.cmd === 'note' ? [[n.pitch,n.start,n.duration]] : []);
   if (arrangement === 'piano') {
    const moved = original.audio.tracks[0].flatMap(n => n.cmd === 'note' &&
      ((n.start === 11.75 || n.start === 23.75) || (n.start === 24 && n.pitch === 52))
      ? [[n.pitch,n.start,n.duration]] : []);
    expected = hands === 'right'
      ? expected.filter(n => !moved.some(m => m[0]===n[0] && m[1]===n[1]))
      : [...expected,...moved.filter(n=>n[1]!==24)];
   }
   expected.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
   assert.deepEqual(part.notes,expected,`${arrangement} ${hands}`);
   assert.equal(part.audio.totalDuration,25);
  }
 }
});
test("source guitar positions preserve the fifth-fret melody and open-string bass",()=>{
 assert.deepEqual(fingerstylePosition(64,false),{str:1,num:5});
 assert.deepEqual(fingerstylePosition(67,false),{str:0,num:3});
 assert.deepEqual(fingerstylePosition(40,false),{str:5,num:0});
 assert.deepEqual(fingerstylePosition(45,false),{str:4,num:0});
 assert.deepEqual(fingerstylePosition(64,true),{str:0,num:0});
 assert.deepEqual(fingerstylePosition(66,false,2),{str:1,num:7});
});

test("guitar key and octave choices stay within the source's playable fret range", () => {
 const {choices} = hymnRangeKeys('C',{low:59,high:69},null,null,{min:0,max:19});
 for(const choice of choices) for(const octave of choice.octaves) {
  const transpose=hymnTransposition('C',choice.key,octave).semitones;
  assert(transpose>=0 && transpose<=19);
  for(const [pitch,chord] of [[40,false],[69,false],[64,true]] as const)
   assert(fingerstylePosition(pitch+transpose,chord,transpose));
 }
 assert.equal(choices[0].octave,0);
});

test("production playback preserves swing and sounding octave for both editions and each practice part", async () => {
 const { hymnPlaybackScore } = await import('../../../packages/music-practice/src/hymn-playback-score');
 const { swingAudio } = await import('../../../packages/music-practice/src/hymn-swing');
 for (const arrangement of ['piano','guitar-fingerstyle'] as const)
  for (const hands of ['both','right','left'] as const)
   for (const transpose of [0,2,12]) {
    const score=arrangeHymn(hymn,arrangement,0,0,hands);
    const audio=abcjs.parseOnly(score.abc)[0].setUpAudio({qpm:60,chordsOff:true,midiTranspose:transpose});
    const plan=hymnPlaybackScore({hymn,arrangement,hands,sectionBars:0,section:0,totalBars:score.totalBars,
     sections:1,abc:score.abc,audio,transpose,stanzas:[1]});
    const sounding=(tracks: typeof audio.tracks) => tracks.flatMap(track=>track.flatMap(n=>n.cmd==='note'
     ? [[n.pitch,n.start,n.duration]] : [])).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
    assert.deepEqual(sounding(plan.audio.tracks),sounding(swingAudio(audio,true).tracks));
    assert.equal(plan.audio.totalDuration,25);
   }
});

test('piano hands remain within a sixth and guitar chords fit a three-fret position', () => {
 const piano = read(arrangeHymn(hymn,'piano',0).abc).audio;
 for (const [hand, track] of piano.tracks.entries()) {
  const notes = track.filter((n): n is Extract<typeof n,{cmd:'note'}> => n.cmd==='note');
  for (const onset of notes) {
   const held = notes.filter(n => n.start <= onset.start && n.start+n.duration > onset.start+1e-7).map(n=>n.pitch);
   assert(Math.max(...held)-Math.min(...held) <= (hand===0 ? 8 : 9), `${hand===0?'Right':'Left'} hand stretch at ${onset.start}`);
  }
 }
 const guitar = read(arrangeHymn(hymn,'guitar-fingerstyle',0).abc).notes;
 for (const start of new Set(guitar.map(n=>n[1]))) {
  const sounding = guitar.filter(n=>n[1]<=start && n[1]+n[2]>start+1e-7);
  const chord = sounding.length>2;
  const positions = sounding.map(n=>fingerstylePosition(n[0],chord)!);
  assert(positions.every(Boolean));
  assert.equal(new Set(positions.map(p=>p.str)).size,positions.length,`Two notes share a string at ${start}`);
  const frets = positions.map(p=>p.num).filter(n=>n>0);
  assert(!frets.length || Math.max(...frets)-Math.min(...frets)<=2,`Fretting stretch at ${start}`);
 }
});
