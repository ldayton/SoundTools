import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {abcPlaybackStaves} from "../../../packages/music-practice/src/hymn-playback-staves";
import {arrangeHymn} from "../../../packages/music-practice/src/hymn-arrangements";
import {instrumentEdition} from "../../../packages/music-practice/src/instrument-editions";
import {hymnPlaybackScore} from "../../../packages/music-practice/src/hymn-playback-score";
import {pianoChord} from "../../../packages/music-practice/src/piano-chord";
const read=(abc:string)=>{
  const tune=abcjs.parseOnly(abc)[0];assert.equal(tune.warnings?.length||0,0,tune.warnings?.join("\n"));
  const audio=tune.setUpAudio({qpm:60,chordsOff:true});
  return {tune,audio,notes:audio.tracks.map(t=>t.filter(n=>n.cmd==="note").map(n=>[n.pitch,n.start,n.duration]))};
};
for(const hymn of hymns.filter(h=>instrumentEdition(h)?.vocal)){
  test(`${hymn.slug}: independent vocal melody with source harmony in playable hand spans`,()=>{
    const score=arrangeHymn(hymn,"original",0), {tune,audio,notes}=read(score.abc);
    assert.equal(tune.lines[0].staff?.length,3);
    assert.deepEqual(notes[0],read(hymn.melody).notes[0]);
    const source=read(hymn.harmony).notes;
    // Every source attack, pitch class, duration and track remains; only octave
    // placement changes. This also protects accidentals and tied durations.
    const classes=(tracks:number[][][])=>tracks.map(t=>t.map(([p,s,d])=>[p%12,s,d]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]||a[2]-b[2]));
    assert.deepEqual(classes(notes.slice(1)),classes(source));
    for(const staff of abcPlaybackStaves(score.abc).slice(1)){
      const hand=staff.tracks.flatMap(i=>notes[i]);
      for(const at of new Set(hand.map(n=>n[1]))){
      const pitches=hand.filter(n=>n[1]<=at+1e-8&&n[1]+n[2]>at+1e-8).map(n=>n[0]);
      assert(Math.max(...pitches)-Math.min(...pitches)<=12,`${hymn.slug} hand span at ${at}`);
      }
    }
    assert.equal(audio.totalDuration,read(hymn.harmony).audio.totalDuration);
    const chords=tune.lines.flatMap(l=>l.staff?.flatMap(s=>s.voices?.flatMap(v=>v.flatMap(n=>n.el_type==="note"?n.chord?.filter((c:{position:string})=>c.position==="default").map((c:{name:string})=>c.name)||[]:[]))||[])||[]);
    assert(chords.length>0);for(const name of chords)assert(pianoChord(name),name);
    const prepared=hymnPlaybackScore({hymn,arrangement:"original",sectionBars:0,section:0,hands:"both",totalBars:score.totalBars,sections:1,abc:score.abc,audio,transpose:0});
    assert(prepared.audio.tracks[0].filter(n=>n.cmd==="note").every(n=>(n as typeof n & {playbackInstrument?:string}).playbackInstrument==="choir"));
    assert(prepared.audio.tracks.slice(1).flat().filter(n=>n.cmd==="note").every(n=>(n as typeof n & {playbackInstrument?:string}).playbackInstrument!=="choir"));
    const muted=hymnPlaybackScore({hymn,arrangement:"original",sectionBars:0,section:0,hands:"both",totalBars:score.totalBars,sections:1,abc:score.abc,audio,transpose:0,mutedStaves:[0]});
    assert.equal(muted.audio.totalDuration,prepared.audio.totalDuration);assert.equal(muted.audio.tracks[0].filter(n=>n.cmd==="note").length,0);
    assert.deepEqual(muted.audio.tracks.slice(1),prepared.audio.tracks.slice(1));
  });
}

test("reviewed bass voicings keep the bass and close oversized intervals",()=>{
 for(const [slug,at,expected]of [["jesus-loves-me",9,[44,51]],["blessed-assurance",3.75,[45,49]],["joy-to-the-world",.875,[43,47]]] as const){
  const abc=arrangeHymn(hymns.find(h=>h.slug===slug)!,"original",0).abc,score=read(abc);
  const lh=abcPlaybackStaves(abc).at(-1)!.tracks.flatMap(i=>score.notes[i]);
  assert.deepEqual(lh.filter(([p,s,d])=>s<=at&&s+d>at).map(n=>n[0]).sort((a,b)=>a-b),expected);
 }
});

test("teacher accompaniment stays within an octave across simultaneous organ voices",()=>{
 const hymn=hymns.find(h=>h.slug==="in-christ-alone")!,abc=arrangeHymn(hymn,"original",0).abc,score=read(abc);
 for(const staff of abcPlaybackStaves(abc).slice(1)){
  const notes=staff.tracks.flatMap(i=>score.notes[i]);
  for(const at of new Set(notes.map(n=>n[1]))){
   const pitches=notes.filter(n=>n[1]<=at+1e-8&&n[1]+n[2]>at+1e-8).map(n=>n[0]);
   assert(Math.max(...pitches)-Math.min(...pitches)<=12,`${staff.label} at ${at}`);
  }
 }
});
