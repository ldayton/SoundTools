import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import { arrangeHymn } from "../../../packages/music-practice/src/hymn-arrangements";
import { hymnLyricsAbc, hymnStanzaAbc } from "../../../packages/music-practice/src/hymn-lyrics";
import { hymnMelodyOffset } from "../../../packages/music-practice/src/hymn-arrangements";
import { hymnPlaybackScore } from "../../../packages/music-practice/src/hymn-playback-score";
import { fairestPosition } from "../../../packages/music-practice/src/fairest-lord-jesus";
import { findGuitarFingering } from "../../../packages/music-practice/src/guitar-chord-search";
import { standardEditionContract } from "../../../packages/music-practice/test-fixtures/standard-edition-contract";
const slug="fairest-lord-jesus",hymn=hymns.find(h=>h.slug===slug)!;
standardEditionContract(slug,{bars:15,beats:60,attacks:41,capo:3,opening:[63,63,63,65,62,63,67,67],closing:[67,67,70,68,67,65,63]});
// Independent reading of all four printed parts from Hymnary.org's Willis score.
// SHA256 bffd508bd75e0ef5e42108cd48a849e143a7b90bad5451bdb98415b21db16bb5.
// Rows are measures, lengths are quarter beats. The first two quarters in
// measure 3 are tied in the archived S/A/T. Active-verse melody articulation
// is tested separately: 42 attacks for verses 1–3, 41 for verse 4.
const printed=[
 [[63,63,63],[65,62,63],[67,67,67],[68,65,67],[70,75,72],[70,68,67],[68,67],[65],[70,72,70],[70,67,68],[68,70,68],[68,65,67,67],[67,67,70,68],[67,65],[63]],
 [[58,60,60],[60,58,58],[63,63,64],[65,62,63],[63,63],[63,65,63],[65,63],[62],[63,63,63],[64,65],[60,60,60],[62,63,63],[65,63,63,63],[63,62],[58]],
 [[55,55,55],[56,53,55],[58,60,60],[60,58,58],[55,60,56],[55,58],[58,58],[58],[58,56,55],[55,60,60],[53,52,53],[53,58,58,58],[59,60,61,60],[58,56],[55]],
 [[51,48,48],[44,46,51],[51,50,48,46],[44,46,51],[51,44,48],[51,51],[50,51],[46],[43,44,46],[48,53],[41,43,44],[46,51,51],[50,48,43,44],[46,46],[51]],
];
const rhythms=[
 [[2,1,1],[1,1,2],[2,1,1],[1,1,2],[2,1,1],[2,1,1],[2,2],[4],[2,1,1],[1,1,2],[2,1,1],[1,1,1,1],[1,1,1,1],[2,2],[4]],
 [[2,1,1],[1,1,2],[2,1,1],[1,1,2],[2,2],[2,1,1],[2,2],[4],[2,1,1],[2,2],[2,1,1],[2,1,1],[1,1,1,1],[2,2],[4]],
 [[2,1,1],[1,1,2],[2,1,1],[1,1,2],[2,1,1],[2,2],[2,2],[4],[2,1,1],[1,1,2],[2,1,1],[1,1,1,1],[1,1,1,1],[2,2],[4]],
 [[2,1,1],[1,1,2],[1,1,1,1],[1,1,2],[2,1,1],[2,2],[2,2],[4],[2,1,1],[2,2],[2,1,1],[2,1,1],[1,1,1,1],[2,2],[4]],
];
function read(abc:string){const tune=abcjs.parseOnly(abc)[0];assert.equal(tune.warnings?.length||0,0,tune.warnings?.join("\n"));return {tune,audio:tune.setUpAudio({chordsOff:true,qpm:60})};}
const notes=(track:ReturnType<typeof read>["audio"]["tracks"][number])=>track.flatMap(n=>n.cmd==="note"?[[n.pitch,n.start*4,n.duration*4]]:[]);
test("every printed pitch, rhythm, tie and accidental survives the complete fifteen-bar SATB",()=>{
 const {audio,tune}=read(hymn.harmony);assert.equal(hymn.key,"Eb");assert.equal(hymn.meter,"4/4");assert.equal(audio.totalDuration*4,60);assert.equal(audio.tracks.length,4);
 printed.forEach((bars,voice)=>{let time=0;const expected:number[][]=[];
  bars.forEach((pitches,bar)=>{const lengths=rhythms[voice][bar];assert.equal(pitches.length,lengths.length);assert.equal(lengths.reduce((a,b)=>a+b),4);
   pitches.forEach((pitch,i)=>{expected.push([pitch,time,lengths[i]]);time+=lengths[i];});});
  assert.equal(time,60);assert.deepEqual(notes(audio.tracks[voice]),expected,`printed part ${voice}`);
 });
 const soprano=tune.lines.flatMap(l=>l.staff?.[0]?.voices?.[0]||[]).filter(n=>n.el_type==="note"&&n.pitches?.length);
 assert.equal(soprano.length,42);assert(soprano.some(n=>n.el_type==="note"&&n.pitches?.some(p=>p.startTie)));
});
test("public-domain print has its own provenance and four exact lyric underlays",()=>{
 const source=readFileSync(new URL("../hymns/source/fairest-lord-jesus.abc",import.meta.url),"utf8");
 assert.equal(hymn.source,"public-domain-score");assert.equal(hymn.sourceUrl,"https://hymnary.org/media/fetch/142891");assert.match(source,/copyright: public domain\./);assert.match(source,/Score supplied by Hymnary.org/);
 assert.equal(hymn.stanzas.length,4);assert(hymn.stanzas.every(s=>s.syllables.length===42));
 const words=(s:string[])=>s.filter(x=>x!=="*").join(" ").replace(/- /g,"");
 assert.equal(words(hymn.stanzas[0].syllables),"Fairest Lord Jesus, Ruler of all nature, O Thou of God and man the Son; Thee will I cherish, Thee will I honor, Thou, my soul's glory, joy, and crown.");
 assert.equal(words(hymn.stanzas[1].syllables),"Fair are the meadows, Fairer still the woodlands, Robed in the blooming garb of spring; Jesus is fairer, Jesus is purer, Who makes the woeful heart to sing.");
 assert.equal(words(hymn.stanzas[2].syllables),"Fair is the sunshine, Fairer still the moonlight, And all the twinkling, starry host; Jesus shines brighter, Jesus shines purer Than all the angels' heav'n can boast.");
 assert.equal(words(hymn.stanzas[3].syllables),"Beautiful Savior, Lord of all nations, Son of God and Son of man! Glory and honor, Praise, adoration, Now and forevermore be Thine!");
 const {tune}=read(hymnLyricsAbc(arrangeHymn(hymn,"original",0).abc,{hymn,selected:[1,2,3,4],offset:0}));
 const melody=tune.lines.flatMap(l=>l.staff?.[0]?.voices?.[0]||[]).filter(n=>n.el_type==="note"&&n.pitches?.length);
 assert.equal(melody.length,42);assert(melody.every(n=>n.el_type==="note"&&n.lyric?.length===4),"There is no common refrain to deduplicate");
});
test("secondary dominants retain E-natural, B-natural and D-flat in the playable piano edition",()=>{
 const {audio}=read(arrangeHymn(hymn,"piano",0).abc);
 const sounding=(beat:number)=>audio.tracks.flatMap(notes).filter(([,s,d])=>s<=beat&&s+d>beat).map(([p])=>p).sort((a,b)=>a-b);
 assert.deepEqual(sounding(36),[46,48,52,70],"C7 keeps the E-natural and B-flat");
 assert.deepEqual(sounding(48),[53,55,59,67],"G7 keeps the B-natural and F");
 assert.deepEqual(sounding(50),[49,51,55,70],"Eb7 keeps the D-flat");
});
test("all four editions repeat the complete form for each of the four verses",()=>{
 for(const arrangement of ["original","guitar-vocal","piano","guitar-edition"] as const){
  const score=arrangeHymn(hymn,arrangement,0),{audio}=read(score.abc);assert.equal(score.totalBars,15);assert.equal(audio.totalDuration*4,60);
  const plan=hymnPlaybackScore({hymn,arrangement,sectionBars:0,section:0,hands:"both",totalBars:15,sections:1,abc:score.abc,audio,transpose:0,stanzas:[1,2,3,4]});
  assert.deepEqual(plan.verses.map(v=>[v.number,v.start,v.end]),[[1,0,60],[2,60,120],[3,120,180],[4,180,240]]);assert.equal(plan.audio.totalDuration*4,240);
  assert.deepEqual(plan.verses.map(v=>notes(plan.audio.tracks[0]).filter(([,at])=>at>=v.start&&at<v.end).length),[42,42,42,41],`${arrangement}: syllables rearticulate in verses 1–3; Lord remains held in verse 4`);
  for(const verse of plan.verses){
   const p=arrangement==="guitar-edition"?55:67;
   const actual=notes(plan.audio.tracks[0]).filter(([,at])=>at>=verse.start+8&&at<verse.start+10).map(([pitch,at,d])=>[pitch,at-verse.start,d]);
   assert.deepEqual(actual,verse.number===4?[[p,8,2]]:[[p,8,1],[p,9,1]],`${arrangement}: measure 3, verse ${verse.number}`);
  }
 }
});

test("active-verse notation and sliced passages agree with playback without changing the source accompaniment",()=>{
 for(const arrangement of ["original","guitar-vocal","piano","guitar-edition"] as const){
  for(const [bars,section] of [[0,0],[2,1]]){
   const score=arrangeHymn(hymn,arrangement,bars,section),baseline=read(score.abc).audio;
   for(const verse of [1,2,3,4]){
    const rendered=read(hymnStanzaAbc(score.abc,hymn,verse,hymnMelodyOffset(hymn,score.from))).audio;
    const beat=bars?0:8,events=notes(rendered.tracks[0]).filter(([,at])=>at>=beat&&at<beat+2);
    assert.deepEqual(events.map(([,at,d])=>[at-beat,d]),verse===4?[[0,2]]:[[0,1],[1,1]],`${arrangement}: verse ${verse}, passage ${section}`);
    assert.deepEqual(rendered.tracks.slice(1).map(notes),baseline.tracks.slice(1).map(notes),"Accompaniment remains unchanged");
    if(bars){
     const abc=hymnStanzaAbc(score.abc,hymn,verse,hymnMelodyOffset(hymn,score.from));
     const plan=hymnPlaybackScore({hymn,arrangement,sectionBars:bars,section,hands:"both",totalBars:score.totalBars,sections:score.sections,abc,audio:rendered,transpose:0,stanza:verse});
     assert.deepEqual(notes(plan.audio.tracks[0]).filter(([,at])=>at>=8&&at<10).map(([,at,d])=>[at,d]),verse===4?[[8,2]]:[[8,1],[9,1]],"Continuous passage playback follows the active verse too");
    }
   }
  }
 }
});

test("a nonconsecutive verse selection retains each articulation and left-hand practice remains independent",()=>{
 for(const arrangement of ["piano","guitar-edition"] as const){
  for(const hands of ["right","left"] as const){
   const score=arrangeHymn(hymn,arrangement,0,0,hands),{audio}=read(score.abc);
   const plan=hymnPlaybackScore({hymn,arrangement,sectionBars:0,section:0,hands,totalBars:15,sections:1,abc:score.abc,audio,transpose:0,stanzas:[2,4]});
   assert.deepEqual(plan.verses.map(v=>v.number),[2,4]);
   const counts=plan.verses.map(v=>notes(plan.audio.tracks[0]).filter(([,at])=>at>=v.start&&at<v.end).length);
   assert.deepEqual(counts,hands==="right"?[42,41]:[notes(audio.tracks[0]).length,notes(audio.tracks[0]).length]);
  }
 }
});

test("reference guitar chord practice keeps exact seventh voicings on playable distinct strings",()=>{
 const {tune,audio}=read(arrangeHymn(hymn,"guitar-edition",0,0,"left").abc),labels=new Map<number,string>();
 let active="";for(const line of tune.lines)for(const staff of line.staff||[])for(const voice of staff.voices||[])for(const n of voice)if(n.el_type==="note"){
  const label=n.chord?.find((c:{position:string})=>c.position==="default")?.name;if(label)active=label;
  if(n.pitches?.length)labels.set(n.startChar!,active);
 }
 const expected:Record<string,number[]>={A7:[45,52,55,61,64],"E7/B":[47,50,56,59,64],"C7/E":[40,48,52,58,60,64],"Dm/F":[53,57,62,65]};
 const groups=new Map<number,number[]>();for(const track of audio.tracks)for(const n of track)if(n.cmd==="note"){const ps=groups.get(n.startChar!)||[];ps.push(n.pitch);groups.set(n.startChar!,ps);}
 const seen=new Set<string>();for(const [start,pitches]of groups){
  const label=labels.get(start)!;if(expected[label]){assert.deepEqual(pitches,expected[label],label);seen.add(label);}
  const positions=pitches.map(p=>fairestPosition(p,true));assert(positions.every(Boolean),`${label}: every tab position exists`);
  positions.forEach((p,i)=>assert.equal([64,59,55,50,45,40][p!.str]+p!.num,pitches[i],`${label}: tab sounds the written pitch`));
  assert.equal(new Set(positions.map(p=>p!.str)).size,pitches.length,label);
  const frets:(number|null)[]=Array(6).fill(null);for(const p of positions)frets[5-p!.str]=p!.num;
  assert(findGuitarFingering(frets,{maxFingers:4,allowBarres:true}),`${label}: physically playable grip`);
 }
 assert.deepEqual([...seen].sort(),Object.keys(expected).sort());
});
