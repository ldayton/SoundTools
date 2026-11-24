import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {arrangeHymn} from "../../../packages/music-practice/src/hymn-arrangements";
import {chordEdition,instrumentEditionIds} from "../../../packages/music-practice/src/instrument-editions";
import {recommendGuitarCapos,capoAccompanimentAbc,capoPosition} from "../../../packages/music-practice/src/guitar-capo";
import {hymnPreferences,hymnSettingsFromQuery} from "../../../packages/music-practice/src/hymn-settings";
import {hymnProgressKey,HymnProgress} from "../../../packages/music-practice/src/hymn-progress";
import {songalongRecords,restoreSongalongRecords} from "../../../packages/music-practice/src/songalong-account-records";
import {migrateLegacy} from "../../../packages/music-practice/src/durable-state";
import {practiceHymn} from "../../../packages/music-practice/test-fixtures/hymns";
const open=[64,59,55,50,45,40];
function source(hymn:typeof hymns[number]){const profile=chordEdition(hymn)!;return {abc:arrangeHymn(hymn,"guitar-edition",0).abc,accompanimentAbc:arrangeHymn(hymn,"guitar-edition",0,0,"left").abc,sourceCapo:profile.capo,transpose:0,shapeKey:profile.guitarKey||hymn.key,positionFor:profile.position};}
for(const id of instrumentEditionIds)test(`${id}: capo advice preserves exact sounding melody/bass and held-note feasibility`,()=>{
 const hymn=hymns.find(h=>h.id===id)!;if(!chordEdition(hymn)){
  assert.equal(instrumentEditionIds.filter(id=>!chordEdition(hymns.find(h=>h.id===id)!)).length,1,"Only the instrumental edition lacks a harmonic guide");
  assert.throws(()=>arrangeHymn(hymn,"guitar-edition",0),/Unsupported instrument score/);return;
 }
 const input=source(hymn),tune=abcjs.parseOnly(input.abc)[0],poly=new Map<number,boolean>();
 for(const l of tune.lines)for(const s of l.staff||[])for(const v of s.voices||[])for(const n of v)if(n.el_type==="note")poly.set(n.startChar!,(n.pitches?.length||0)>1);
 const notes=tune.setUpAudio({chordsOff:true}).tracks.flatMap(t=>t.flatMap(n=>n.cmd==="note"?[n]:[]));
 const choices=recommendGuitarCapos(input);assert(choices.length>=1&&choices.length<=3);assert(choices.some(c=>c.fret===input.sourceCapo&&c.scoreSetting));
 assert.deepEqual(choices.map(c=>[c.fret,c.cost]),recommendGuitarCapos(input).map(c=>[c.fret,c.cost]));
 for(const c of choices){
  for(const n of notes){const p=capoPosition(c,n.pitch,poly.get(n.startChar!)||false)!;assert(p,`${hymn.slug} ${n.pitch}`);assert.equal(open[p.str]+p.num+c.fret,n.pitch+input.sourceCapo);assert(p.num>=0&&p.num+c.fret<=24);}
  for(const at of [...new Set(notes.flatMap(n=>[n.start,n.start+n.duration]))]){
   const held=notes.filter(n=>n.start<=at+1e-7&&n.start+n.duration>at+1e-7),strings=held.map(n=>capoPosition(c,n.pitch,poly.get(n.startChar!)||false)!.str);
   assert.equal(new Set(strings).size,strings.length,`${hymn.slug} capo ${c.fret} at ${at}`);
  }
 }
});
test("teacher score finds capo 2 from feasibility and chord ranking",()=>{
 const h=hymns.find(h=>h.slug==="in-christ-alone")!,choices=recommendGuitarCapos(source(h));
 assert.equal(choices[0].fret,2);assert.equal(choices[0].shapeKey,"C");assert(choices[0].chords.includes("C/E"));assert(choices[0].chords.includes("Am"));
});
test("I'll Fly Away offers distinct useful shape families without changing the key",()=>{
 const h=hymns.find(h=>h.slug==="ill-fly-away")!,input=source(h),choices=recommendGuitarCapos(input);
 assert(choices.some(c=>c.fret===0&&c.shapeKey==="C"));assert(choices.some(c=>c.fret===3&&c.shapeKey==="A"));assert(choices.some(c=>c.fret===5&&c.shapeKey==="G"));
 for(const c of choices){
  const rewritten=capoAccompanimentAbc(input.accompanimentAbc,c,-c.fret),tune=abcjs.parseOnly(rewritten)[0];assert.equal(tune.warnings?.length||0,0);
  const before=abcjs.parseOnly(input.accompanimentAbc)[0].setUpAudio({chordsOff:true}),after=tune.setUpAudio({chordsOff:true});assert.equal(after.totalDuration,before.totalDuration);
  if(c.scoreSetting){assert.equal(rewritten,input.accompanimentAbc);continue;}
  const first=after.tracks.flatMap(t=>t.flatMap(n=>n.cmd==="note"&&n.start===0?[n.pitch]:[]));
  assert.deepEqual(first,[...c.voicings.get("C")!.notes.map(n=>n.midi+c.fret)].sort((a,b)=>a-b));
  const g7=c.voicings.get("G7")!;assert.deepEqual([...new Set(g7.notes.map(n=>(n.midi+c.fret)%12))].sort((a,b)=>a-b),[2,5,7,11]);assert.equal((g7.bassMidi+c.fret)%12,7);
 }
});
test("impossible low bass is rejected rather than silently moved up an octave",()=>{
 const choices=recommendGuitarCapos({abc:'X:1\nL:1/4\nV:G clef=treble-8\nK:C\n[V:G] "C/E"[E,C]4 |]',sourceCapo:0,transpose:0,shapeKey:"C",positionFor:p=>p===40?{str:5,num:0}:p===48?{str:4,num:3}:undefined});
 assert.deepEqual(choices.map(c=>c.fret),[0]);
});
test("capo choices roundtrip through URLs, progress and account pitch records; old defaults remain original",()=>{
 const base=hymnPreferences(practiceHymn.id,{arrangement:"guitar-edition"});assert.equal(base.key,"original");assert.equal(base.capo,undefined);
 const selected=hymnSettingsFromQuery(base,new URLSearchParams({capo:"0"}));assert.equal(selected.capo,0);assert.equal(selected.key,"original");
 assert.notEqual(hymnProgressKey(base,practiceHymn.key),hymnProgressKey(selected,practiceHymn.key));
 assert.equal(hymnSettingsFromQuery(selected,new URLSearchParams({key:"E"})).capo,null);
 assert.equal(hymnSettingsFromQuery(selected,new URLSearchParams({capo:"99"})).capo,0);
 const state=migrateLegacy({}),progress=new HymnProgress(undefined,[practiceHymn.id]);
 state.activities.sight=progress.snapshot(selected,practiceHymn.key,1);const records=songalongRecords(state);
 assert.equal((records[`hymn:${practiceHymn.id}:pitch`] as any).capo,0);
 assert.equal((restoreSongalongRecords(records).activities.sight as any).capo,0);
 state.activities.sight=progress.snapshot({...selected,capo:null},practiceHymn.key,1);assert.equal((restoreSongalongRecords(songalongRecords(state)).activities.sight as any).capo,null);
});
