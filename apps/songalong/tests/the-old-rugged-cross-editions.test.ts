import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {arrangeHymn} from "../../../packages/music-practice/src/hymn-arrangements";
import {recommendGuitarCapos} from "../../../packages/music-practice/src/guitar-capo";
import {hymnPlaybackScore} from "../../../packages/music-practice/src/hymn-playback-score";
import {hymnLyricsAbc,hymnStanzaAbc} from "../../../packages/music-practice/src/hymn-lyrics";
import {ruggedPosition} from "../../../packages/music-practice/src/the-old-rugged-cross";
import {findGuitarFingering} from "../../../packages/music-practice/src/guitar-chord-search";
import {standardEditionContract} from "../../../packages/music-practice/test-fixtures/standard-edition-contract";
const slug="the-old-rugged-cross",hymn=hymns.find(h=>h.slug===slug)!;
standardEditionContract(slug,{bars:20,beats:48,attacks:76,capo:3,opening:[62,63,65,64,67,65,65,65],closing:[74,72,70,65,69,72,70]});

// Independent notehead/staff reading of all four parts of the supplied Timeless
// Truths print, SHA256 ebdf8d9248ebaa1114cd0ef3a7ef195ca19b1527831dea443d7798d8e8aea683.
// Each row is a printed measure. Durations are sixteenths; ties join listed heads.
const print=[
 [[62,63],[65,64,67,65,65,65],[67,66,69,67,67,67],[69,67,65,63,65,63],[62,62],
  [62,63],[65,64,67,65,65,65],[67,66,69,67,67,67],[67,65,65,75,74,72],[70,70],
  [69,70],[72,72,72,72,70,69],[70,70,70,69],[67,67,67,70,69,67],[65,65],
  [65,70],[74,74,74,74,75,74],[67,67,75,75],[74,72,70,65,69,72],[70,70]],
 [[58,60],[62,61,61,62,62,62],[63,63,63,63,64,64],[63,63,62,60,60,60],[58,58],
  [58,60],[62,61,61,62,62,62],[63,63,63,63,64,64],[63,63,63,67,65,63],[62,62],
  [60,62],[63,63,63,63,63],[62,61,63,62,65,65],[63,63,63,67,65,63],[62,62],
  [62,62],[65,65,65,65,67,65],[63,63,63,63,67,67],[65,63,62,63,63,63],[62,62]],
 [[53,53],[58,58,55,58,58,58],[58,57,60,58,60,60],[60,57,58,57,57,53],[53,53],
  [53,53],[58,58,55,58,58,58],[58,57,60,58,60,60],[60,58,57,57,58,57],[58,58],
  [53,53],[57,57,57,57,53],[53,52,55,53,58,58],[58,58,58,58,58,58],[58,58],
  [58,58],[58,58,58,58,58],[58,58,58,58,58,58],[58,57,58,57,60,53],[53,53]],
 [[46,46],[46,46,46,46,46,46],[51,51,51,51,48,48],[53,53,53,53,53,53],[46,46],
  [46,46],[46,46,46,46,46,46],[51,51,51,51,48,48],[53,53,53,53,53,53],[46,46],
  [53,53],[53,53,53,53,53],[46,46,46,46,50,50],[51,51,51,51,51,51],[46,46],
  [46,46],[46,46,46,46,46],[51,51,51,51,51,51],[53,53,53,53,53,53],[46,46]],
];
const normal=["11","312411","312411","312222","64"];
const rhythms=[
 [...normal,...normal,"11","312222","6411","312222","64","11","312222","6411","312222","64"],
 [...normal,...normal,"11","31242","222411","312222","64","11","312222","222411","312222","64"],
 [...normal,...normal,"11","31242","222411","312222","64","11","31242","222411","312222","64"],
 [...normal,...normal,"11","31242","222411","312222","64","11","31242","222411","312222","64"],
];
const common=[[2,4],[4,0],[7,4],[9,0],[14,0],[19,0]];
const ties=[new Set([...common,[12,0],[17,0]].map(x=>x.join(":"))),new Set([...common,[3,0]].map(x=>x.join(":"))),new Set(common.map(x=>x.join(":"))),new Set([...common,[3,0]].map(x=>x.join(":")))];
function read(abc:string){const tune=abcjs.parseOnly(abc)[0];assert.equal(tune.warnings?.length||0,0,tune.warnings?.join("\n"));return {tune,audio:tune.setUpAudio({qpm:60,chordsOff:true})};}
const notes=(track:ReturnType<typeof read>["audio"]["tracks"][number])=>track.flatMap(n=>n.cmd==="note"?[[n.pitch,n.start*16,n.duration*16]]:[]);
test("every printed pitch, accidental, rhythm, tie and answering part survives the twenty source measures",()=>{
 const {audio}=read(hymn.harmony);assert.equal(hymn.key,"Bb");assert.equal(hymn.meter,"6/8");assert.equal(audio.totalDuration*4,48);assert.equal(audio.tracks.length,4);
 print.forEach((bars,voice)=>{let time=0,carry=false;const expected:number[][]=[];
  bars.forEach((ps,bar)=>{const ds=[...rhythms[voice][bar]].map(Number);assert.equal(ps.length,ds.length);assert.equal(ds.reduce((a,b)=>a+b),[2,12,12,12,10][bar%5]);
   ps.forEach((p,i)=>{const d=ds[i];if(carry){assert.equal(expected.at(-1)![0],p);expected.at(-1)![2]+=d;}else expected.push([p,time,d]);carry=ties[voice].has(`${bar}:${i}`);time+=d;});});
  assert.equal(time,192);assert.deepEqual(notes(audio.tracks[voice]),expected,`printed part ${voice}`);
 });
 const sourceHeads=read(hymn.harmony).tune.lines.flatMap(l=>l.staff?.[0]?.voices?.[0]||[]).filter(n=>n.el_type==="note"&&n.pitches?.length);assert.equal(sourceHeads.length,84);
});
test("four complete verses share one refrain, with syllabic reattacks following the active underlay",()=>{
 assert.equal(hymn.stanzas.length,4);assert(hymn.stanzas.every(s=>s.syllables.length===84));
 const words=(s:string[])=>s.filter(x=>x!=="*").join(" ").replace(/- /g,"");
 const refrain="So I'll cherish the old rugged cross, Till my trophies at last I lay down; I will cling to the old rugged cross, And exchange it someday for a crown.";
 for(const stanza of hymn.stanzas)assert.equal(words(stanza.syllables.slice(44)),refrain);
 assert.equal(words(hymn.stanzas[0].syllables.slice(0,44)),"On a hill far away stood an old rugged cross, The emblem of suff'ring and shame; And I love that old cross where the dearest and best For a world of lost sinners was slain.");
 assert.match(words(hymn.stanzas[1].syllables),/Has a wondrous attraction for me;/);
 assert.match(words(hymn.stanzas[2].syllables),/For 'twas on that old cross Jesus suffered and died,/);
 assert.match(words(hymn.stanzas[3].syllables),/Where His glory forever I'll share\./);
 const tune=read(hymnLyricsAbc(arrangeHymn(hymn,"original",0).abc,{hymn,selected:[1,2,3,4],offset:0})).tune;
 const lead=tune.lines.flatMap(l=>l.staff?.[0]?.voices?.[0]||[]).filter(n=>n.el_type==="note"&&n.pitches?.length);
 assert(lead.slice(0,44).every(n=>n.el_type==="note"&&n.lyric?.length===4));assert(lead.slice(44).every(n=>n.el_type==="note"&&n.lyric?.length===1));
 for(const arrangement of ["original","guitar-vocal","piano","guitar-edition"] as const){
  const score=arrangeHymn(hymn,arrangement,0),{audio}=read(score.abc);
  const plan=hymnPlaybackScore({hymn,arrangement,sectionBars:0,section:0,hands:"both",totalBars:20,sections:1,abc:score.abc,audio,transpose:0,stanzas:[1,2,3,4]});
  assert.deepEqual(plan.verses.map(v=>[v.number,v.start,v.end]),[[1,0,48],[2,48,96],[3,96,144],[4,144,192]]);
  assert.deepEqual(plan.verses.map(v=>notes(plan.audio.tracks[0]).filter(([,t])=>t>=v.start*4&&t<v.end*4).length),[77,77,76,77]);
  if(arrangement==="piano"||arrangement==="guitar-vocal")
   assert.deepEqual(plan.verses.map(v=>new Set(plan.audio.tracks.flatMap(notes).filter(([,t])=>t>=v.start*4&&t<v.end*4).map(([,t])=>t)).size),[80,80,79,80],"Playback includes three accompaniment attacks under the held refrain melody");
  for(const stanza of [1,2,3,4]){const adapted=read(hymnStanzaAbc(score.abc,hymn,stanza));assert.deepEqual(adapted.audio.tracks.slice(1).map(notes),audio.tracks.slice(1).map(notes));}
 }
});
test("reference accompaniment uses playable distinct strings and tablature pitches match the written notes",()=>{
 const {audio,tune}=read(arrangeHymn(hymn,"guitar-edition",0,0,"left").abc),groups=new Map<number,number[]>(),labels=new Map<number,string>();
 let at=0,active="";for(const line of tune.lines)for(const n of line.staff?.[0]?.voices?.[0]||[])if(n.el_type==="note"){
  const label=n.chord?.find((c:{position:string})=>c.position==="default")?.name;if(label)active=label;labels.set(at,active);at+=n.duration;
 }
 const expected:Record<string,number[]>={G:[43,47,50,55,59,67],Gdim7:[43,46,61,64],C:[48,52,55,60,64],Cdim:[48,51,66],"D7/C":[48,50,57,60,66],A:[45,52,57,61,64],D7:[50,57,60,66],"G/D":[50,55,59,67],D:[50,57,62,66],"C/G":[43,48,52,55,60,64],"G/B":[47,50,55,59,67]};
 for(const track of audio.tracks)for(const n of track)if(n.cmd==="note"){const ps=groups.get(n.start)||[];ps.push(n.pitch);groups.set(n.start,ps);}
 for(const [time,pitches] of groups){
  assert.deepEqual(pitches,expected[labels.get(time)!],labels.get(time));
  const positions=pitches.map(p=>ruggedPosition(p,true));assert(positions.every(Boolean),String(pitches));
  assert.equal(new Set(positions.map(p=>p!.str)).size,pitches.length,String(pitches));
  positions.forEach((p,i)=>assert.equal([64,59,55,50,45,40][p!.str]+p!.num,pitches[i]));
  const frets:(number|null)[]=Array(6).fill(null);for(const p of positions)frets[5-p!.str]=p!.num;
  assert(findGuitarFingering(frets,{maxFingers:4,allowBarres:true}),String(pitches));
 }
});

test("every recommended vocal-guitar capo preserves all chosen chord tones after chromatic passing chords",()=>{
 const accompanimentAbc=arrangeHymn(hymn,"guitar-edition",0,0,"left").abc,{tune,audio}=read(accompanimentAbc);
 const labels=new Map<number,string>();let active="";
 for(const line of tune.lines)for(const n of line.staff?.[0]?.voices?.[0]||[])if(n.el_type==="note"){
  const label=n.chord?.find((c:{position:string})=>c.position==="default")?.name;if(label)active=label;labels.set(n.startChar!,active);
 }
 const groups=new Map<number,{label:string;start:number;duration:number}>();
 for(const track of audio.tracks)for(const n of track)if(n.cmd==="note")groups.set(n.startChar!,{label:labels.get(n.startChar!)!,start:n.start*16,duration:n.duration*16});
 const sorted=(ns:number[][])=>ns.sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
 for(let shift=0;shift<12;shift++){
  const choices=recommendGuitarCapos({abc:accompanimentAbc,accompanimentAbc,accompanimentOnly:true,sourceCapo:3,transpose:shift-3,shapeKey:"G",positionFor:ruggedPosition});
  assert(choices.length);
  for(const choice of choices){
   const expected=[...groups.values()].flatMap(g=>choice.voicings.get(g.label)!.notes.map(n=>[n.midi+choice.fret,g.start,g.duration]));
   const actual=read(arrangeHymn(hymn,"guitar-vocal",0,0,"both",undefined,shift-3,choice).abc).audio;
   assert.deepEqual(sorted(notes(actual.tracks[1])),sorted(expected),`sounding shift ${shift}, capo ${choice.fret}`);
  }
 }
});

test("the playable piano retains both diminished passing colours and the complete final tonic",()=>{
 const {audio}=read(arrangeHymn(hymn,"piano",0).abc);
 const sounding=(beat:number)=>audio.tracks.flatMap(notes).filter(([,s,d])=>s<=beat*4&&s+d>beat*4).map(([p])=>p).sort((a,b)=>a-b);
 assert.deepEqual(sounding(1.25),[46,49,52,64],"Bb diminished passing chord keeps Db and E-natural");
 assert.deepEqual(sounding(4.25),[51,54,57,66],"Eb diminished keeps F-sharp and A-natural");
 assert.deepEqual(sounding(28),[46,49,52,70],"Refrain passing chord keeps C-sharp's sounding Db pitch");
 assert.deepEqual(sounding(46),[46,50,53,70],"The final tonic retains root, third and fifth");
});
