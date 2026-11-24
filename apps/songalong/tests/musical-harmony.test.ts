import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {arrangeHymn} from "../../../packages/music-practice/src/hymn-arrangements";
import {chordEdition, instrumentEditionIds} from "../../../packages/music-practice/src/instrument-editions";
import {hymnPitchRange,hymnRangeKeys} from "../../../packages/music-practice/src/hymn-range";
import {hymnTransposition} from "../../../packages/music-practice/src/hymn-transpose";
import {hymnPreferences} from "../../../packages/music-practice/src/hymn-settings";
import {capoAudio} from "../../../packages/music-practice/src/edition-score";
import {hymnPlaybackScore} from "../../../packages/music-practice/src/hymn-playback-score";
const read=(slug:string,arrangement:"original"|"guitar-edition")=>{
 const hymn=hymns.find(h=>h.slug===slug)!;
 const tune=abcjs.parseOnly(arrangeHymn(hymn,arrangement,0).abc.replaceAll(":|","|]"))[0];
 assert.equal(tune.warnings?.length||0,0,tune.warnings?.join("\n"));
 return {tune,tracks:tune.setUpAudio({chordsOff:true}).tracks.map(t=>t.filter(n=>n.cmd==="note"))};
};
const sounding=(tracks:ReturnType<typeof read>["tracks"],at:number)=>[...new Set(tracks.flat().filter(n=>n.start<=at+1e-7&&n.start+n.duration>at+1e-7).map(n=>n.pitch))].sort((a,b)=>a-b);
function labels(tune:ReturnType<typeof read>["tune"]){
 const result=new Map<number,string>(),clocks=new Map<string,number>();
 for(const l of tune.lines)for(const [s,staff]of(l.staff||[]).entries())for(const[v,voice]of(staff.voices||[]).entries()){
  const id=`${s}:${v}`;let at=clocks.get(id)||0;
  for(const n of voice)if(n.el_type==="note"){
   const label=n.chord?.find((c:{position:string;name:string})=>c.position==="default")?.name;
   if(label)result.set(Math.round(at*64),label.replaceAll("♯","#"));at+=n.duration;
  }clocks.set(id,at);
 }return result;
}
test("vocal chord guides describe the source piano harmony, not the instrumental reharmonization",()=>{
 for(const [slug,cases]of [
  ["blessed-assurance",[[3,"A/E",[52,57,64,73]],[7.5,"Em/G",[43,55,59,64]],[12.75,"A",[57,64,69,73]],[16.5,"Em/G",[43,55,59,64]]]],
  ["joy-to-the-world",[[1,"D/A",[45,57,62,66]],[8.5,"D/A",[45,57,62,66]],[.875,"Em/G",[43,47,64,67]]]],
 ] as const){const score=read(slug,"original"),guide=labels(score.tune);
  for(const [at,chord,notes]of cases){assert.equal(guide.get(at*64),chord,`${slug} ${at}`);assert.deepEqual(sounding(score.tracks.slice(1),at),notes,`${slug} ${chord}`);}
 }
});
test("teacher organ agrees with the requested B minor, slash basses and major dominants",()=>{
 const score=read("in-christ-alone","original"),guide=labels(score.tune);
 const harmonies:Record<string,{bass:number;tones:number[]}>= {
  D:{bass:38,tones:[2,6,9]},G:{bass:43,tones:[7,11,2]},A:{bass:45,tones:[9,1,4]},
  "D/F#":{bass:42,tones:[2,6,9]},Bm:{bass:47,tones:[11,2,6]},Em:{bass:40,tones:[4,7,11]},
 };
 for(const [offset,chord]of guide){
  const at=offset/64,expected=harmonies[chord];assert(expected,chord);
  assert.equal(sounding([score.tracks[4]],at)[0],expected.bass,`${chord} bass at ${at}`);
  if(at<11.625)assert(sounding([score.tracks[2],score.tracks[4]],at).every(p=>expected.tones.includes(p%12)),`${chord} inner voices at ${at}`);
 }
 for(const [at,chord,notes]of [[8.375,"Bm",[47,62,66]],[7.625,"D/F#",[42,62,69]],[10.625,"D/F#",[42,57,62]],[2.125,"A",[45,57,61]],[13.125,"Em",[40,55,59]]] as const){
  assert.equal(guide.get(at*64),chord);assert.deepEqual(sounding([score.tracks[2],score.tracks[4]],at),notes);
 }
 // The interlude's independent upper line remains exactly as printed.
 const source=abcjs.parseOnly(hymns.find(h=>h.slug==="in-christ-alone")!.harmony.replaceAll(":|","|]"))[0].setUpAudio({chordsOff:true});
 const notes=(track:typeof source.tracks[number])=>track.flatMap(n=>{
  if(n.cmd!=="note" || n.start<11.625)return [];
  const {startChar,endChar,...music}=n;return [music];
 });
 assert.deepEqual(notes(score.tracks[2]),notes(source.tracks[2]));
});
test("guitar final chords put the tonic at the bottom without moving the melody or sharing a string",()=>{
 for(const [slug,at,pitches]of [["silent-night",8.25,[45,52,57,61]],["joy-to-the-world",9,[48,52,55]]] as const){
  const score=read(slug,"guitar-edition");assert.deepEqual(sounding(score.tracks,at),pitches);
  const profile=chordEdition(hymns.find(h=>h.slug===slug)!)!;
  const positions=pitches.map(p=>profile.position(p,true)!);assert.equal(new Set(positions.map(p=>p.str)).size,pitches.length);
 }
});
for(const id of instrumentEditionIds)test(`${id}: original key default is retained; dedicated guitar keys have legal capo positions`,()=>{
 const hymn=hymns.find(h=>h.id===id)!;assert.equal(hymnPreferences(id).key,"original");
 const profile=chordEdition(hymn);if(!profile)return;
 const range=hymnPitchRange(arrangeHymn(hymn,"piano",0,0,"right").abc);
 const choices=hymnRangeKeys(hymn.key,range,null,null,{min:-profile.capo,max:11-profile.capo}).choices;
 assert.equal(choices.length,13);assert(choices.every(c=>c.fits));
 const score=arrangeHymn(hymn,"guitar-edition",0),raw=abcjs.parseOnly(score.abc)[0].setUpAudio({qpm:60,chordsOff:true});
 for(const c of choices){
  const shift:number=hymnTransposition(hymn.key,c.key,c.octave).semitones;
  const capo:number=profile.capo+shift;
  assert(capo>=0&&capo<=11);
  const current=capoAudio(raw,capo);
  const played=hymnPlaybackScore({hymn,arrangement:"guitar-edition",sectionBars:0,section:0,hands:"both",totalBars:score.totalBars,sections:1,abc:score.abc,audio:current,transpose:shift,stanzas:[1]});
  for(const [index,track]of raw.tracks.entries()){
   const first=track.find(n=>n.cmd==="note"),actual=played.audio.tracks[index].find(n=>n.cmd==="note");
   if(first?.cmd==="note"&&actual?.cmd==="note")assert.equal(actual.pitch,first.pitch+capo,`${hymn.slug} ${c.key} track ${index}`);
  }
 }
});
