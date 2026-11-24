import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {arrangeHymn} from "../../../packages/music-practice/src/hymn-arrangements";
import {instrumentEditionIds,chordEdition} from "../../../packages/music-practice/src/instrument-editions";
import {hymnHasVoice,hymnPrimaryInstrument,selectHymnCombination} from "../../../packages/music-practice/src/hymn-instruments";
import {hymnPreferences,hymnSettingsFromQuery} from "../../../packages/music-practice/src/hymn-settings";
import {selectEditionVoice} from "../../../packages/music-practice/src/edition-score";
import {hymnPlaybackScore} from "../../../packages/music-practice/src/hymn-playback-score";
import {recommendGuitarCapos} from "../../../packages/music-practice/src/guitar-capo";
import {songalongRecords,restoreSongalongRecords} from "../../../packages/music-practice/src/songalong-account-records";
import {HymnProgress} from "../../../packages/music-practice/src/hymn-progress";
import {migrateLegacy} from "../../../packages/music-practice/src/durable-state";
import {practiceHymn} from "../../../packages/music-practice/test-fixtures/hymns";
function read(abc:string){const tune=abcjs.parseOnly(abc)[0];assert.equal(tune.warnings?.length||0,0,tune.warnings?.join("\n"));const audio=tune.setUpAudio({chordsOff:true,qpm:60});return {tune,audio,notes:audio.tracks.map(t=>t.flatMap(n=>n.cmd==="note"?[[n.pitch,n.start,n.duration]]:[]))};}
const shifted=(notes:number[][],by:number)=>notes.map(([pitch,start,length])=>[pitch+by,start,length]);
for(const id of instrumentEditionIds)test(`${id}: four combinations have independent accompaniment and concert-pitch voice`,()=>{
 const h=hymns.find(h=>h.id===id)!,p=chordEdition(h);
 if(!p){assert.equal(selectHymnCombination(h,"piano","piano",true),undefined);assert.equal(selectHymnCombination(h,"guitar-fingerstyle","guitar",true),undefined);return;}
 assert.equal(selectHymnCombination(h,"piano","guitar"),"guitar-edition");
 assert.equal(selectHymnCombination(h,"original","guitar"),"guitar-vocal");
 assert.equal(selectHymnCombination(h,"guitar-vocal","piano"),"original");
 assert.equal(selectHymnCombination(h,"guitar-vocal","guitar",false),"guitar-edition");
 assert.equal(selectHymnCombination(h,"original","piano",false),"piano");
 const melody=read(selectEditionVoice(arrangeHymn(h,"original",0).abc,"right")),guitar=read(arrangeHymn(h,"guitar-edition",0,0,"left").abc);
 for(const transpose of [-p.capo,0,11-p.capo]){
  const score=arrangeHymn(h,"guitar-vocal",0,0,"both",undefined,transpose),combined=read(score.abc);
  assert.equal(combined.tune.lines[0].staff?.length,2);
  const guitarKey=combined.tune.lines[0].staff![1].key!;assert.equal(guitarKey.root+(guitarKey.acc||""),p.guitarKey||h.key,"Guitar notation stays capo-relative");assert.equal(combined.audio.totalDuration,melody.audio.totalDuration);
  assert.deepEqual(combined.notes[0],shifted(melody.notes[0],transpose),"Voice retains melody, rests, ties and register");
  assert.deepEqual(combined.notes[1],shifted(guitar.notes[0],p.capo+transpose),"Guitar plays accompaniment rather than the fingerstyle melody");
  for(const [hands,index]of [["right",0],["left",1]] as const)assert.deepEqual(read(arrangeHymn(h,"guitar-vocal",0,0,hands,undefined,transpose).abc).notes,[combined.notes[index]]);
  const prepared=hymnPlaybackScore({hymn:h,arrangement:"guitar-vocal",sectionBars:0,section:0,hands:"both",totalBars:score.totalBars,sections:1,abc:score.abc,audio:combined.audio,transpose,stanzas:[1]});
  assert.deepEqual(prepared.audio.tracks.map(t=>t.flatMap(n=>n.cmd==="note"?[[n.pitch,n.start,n.duration]]:[])),combined.notes);
  assert(prepared.audio.tracks[0].filter(n=>n.cmd==="note").every(n=>(n as typeof n & {playbackInstrument?:string}).playbackInstrument==="choir"));
 }
 for(const size of [2,4]){
  const first=arrangeHymn(h,"guitar-vocal",size);
  for(const section of [...new Set([0,first.sections-1])]){
   const actual=read(arrangeHymn(h,"guitar-vocal",size,section).abc);
   const vocal=read(selectEditionVoice(arrangeHymn(h,"original",size,section).abc,"right"));
   const accompaniment=read(arrangeHymn(h,"guitar-edition",size,section,"left").abc);
   assert.deepEqual(actual.notes,[vocal.notes[0],shifted(accompaniment.notes[0],p.capo)],"Passage boundaries preserve each independent part");
  }
 }
 const cs=recommendGuitarCapos({abc:arrangeHymn(h,"guitar-edition",0).abc,accompanimentAbc:arrangeHymn(h,"guitar-edition",0,0,"left").abc,sourceCapo:p.capo,transpose:0,shapeKey:p.guitarKey||h.key,positionFor:p.position});
 for(const c of cs){
  const combined=read(arrangeHymn(h,"guitar-vocal",0,0,"both",undefined,0,c).abc);
  assert.deepEqual(combined.notes[0],melody.notes[0],"Changing capo must never transpose the singer");
  if(!c.scoreSetting){const first=[...c.voicings.values()][0];assert.deepEqual(combined.notes[1].filter(n=>n[1]===0).map(n=>n[0]).sort((a,b)=>a-b),first.notes.map(n=>n.midi+c.fret).sort((a,b)=>a-b),"Alternate capo accompaniment sounds at the fixed concert key");}
 }
});
test("combined score survives links, bookmarks and account restore without conflicting instrument fields",()=>{
 const settings=hymnSettingsFromQuery(hymnPreferences(practiceHymn.id),new URLSearchParams({arrangement:"guitar-vocal"}));assert.equal(settings.arrangement,"guitar-vocal");assert(hymnHasVoice(settings.arrangement));assert.equal(hymnPrimaryInstrument(settings.arrangement),"guitar");
 const state=migrateLegacy({}),progress=new HymnProgress(undefined,[practiceHymn.id]);state.activities.sight=progress.snapshot(settings,practiceHymn.key,1);
 const restored=restoreSongalongRecords(songalongRecords(state)),loaded=new HymnProgress(restored.activities.sight as any,[practiceHymn.id]);assert.equal(loaded.forHymn(practiceHymn.id).arrangement,"guitar-vocal");
});
