import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import { arrangeHymn } from "../../../packages/music-practice/src/hymn-arrangements";
import { hymnPlaybackScore } from "../../../packages/music-practice/src/hymn-playback-score";
import { hymnLyricsAbc } from "../../../packages/music-practice/src/hymn-lyrics";
import { standardEditionContract } from "../../../packages/music-practice/test-fixtures/standard-edition-contract";

const slug="in-the-sweet-by-and-by",hymn=hymns.find(h=>h.slug===slug)!;
standardEditionContract(slug,{bars:17,beats:65,attacks:66,capo:3,opening:[65,67,69,67,65,67,65,62],closing:[60,65,69,67,65,64,65]});

// Independent reading of both printed chord staves, not four invented voices.
// Kravchuk F-major PDF SHA256:
// 51ec4eda3d61abee2ec9db465e141ed3595942a3849cf5618cfb18673afd7b2b.
// Each row is a measure (the first is a pickup). Durations are sixteenths;
// empty pitch groups are written rests, including the final quarter rest.
const upperLengths=[[3,1],[4,2,2,4,3,1],[12,3,1],[4,2,2,4,3,1],[12,3,1],[4,2,2,4,3,1],[12,3,1],[4,2,2,4,2,2],[12,3,1],[12,3,1],[12,2,2],[4,2,2,4,2,2],[12,3,1],[12,3,1],[12,2,2],[4,2,2,4,2,2],[12,4]];
const lowerLengths=[...upperLengths.slice(0,8),[12,4],[4,3,1,4,3,1],[4,2,2,4,2,2],[4,2,2,4,2,2],[4,2,2,4,4],[4,3,1,4,3,1],[4,2,2,4,2,2],[4,2,2,4,2,2],[12,4]];
const upper=[
 [[60,65],[60,67]],
 [[60,69],[60,67],[60,65],[62,67],[62,65],[58,62]],
 [[57,60],[60,65],[60,67]],
 [[60,69],[60,69],[60,69],[60,72],[60,72],[65,69]],
 [[64,67],[60,65],[60,67]],
 [[60,69],[60,67],[60,65],[62,67],[62,65],[58,62]],
 [[57,60],[60,65],[60,67]],
 [[60,69],[60,67],[60,65],[62,67],[60,65],[60,64]],
 [[60,65],[65,69],[67,70]],
 [[69,72],[69,72],[65,69]],
 [[64,67],[64,67],[65,69]],
 [[67,70],[67,70],[67,70],[67,70],[65,69],[64,67]],
 [[65,69],[65,69],[67,70]],
 [[69,72],[60,69],[60,67]],
 [[62,65],[60,64],[58,62]],
 [[57,60],[60,65],[60,69],[60,67],[60,65],[60,64]],
 [[60,65],[]],
];
const lower=[
 [[53,57],[53,58]],
 [[53,60],[53,58],[53,57],[46,58],[46,58],[50,53]],
 [[53],[53,57],[53,58]],
 [[53,60],[53,60],[53,60],[53,57],[53,57],[53,60]],
 [[48,60],[53,57],[53,58]],
 [[53,60],[53,58],[53,57],[46,58],[46,58],[50,53]],
 [[53],[53,57],[53,58]],
 [[53,60],[53,58],[53,57],[46,58],[48,57],[48,55]],
 [[41,57],[]],
 [[],[53,60],[53,60],[53,60],[53,60],[53,60]],
 [[48,60],[48,60],[48,60],[48,60],[48,60],[48,60]],
 [[48,60],[48,60],[48,60],[48,60],[48,60],[48,60]],
 [[53,60],[53,60],[53,60],[53,60],[]],
 [[],[53,60],[53,60],[53,60],[53,60],[45,53]],
 [[46,53],[46,58],[46,58],[46,58],[46,53],[46,53]],
 [[48,53],[48,57],[48,60],[48,58],[48,57],[48,55]],
 [[41,53,57],[]],
];
function read(abc:string){
 const tune=abcjs.parseOnly(abc)[0];assert.equal(tune.warnings?.length||0,0,tune.warnings?.join("\n"));
 return {tune,audio:tune.setUpAudio({qpm:60,chordsOff:true})};
}
const timeline=(track:ReturnType<typeof read>["audio"]["tracks"][number])=>track.flatMap(n=>n.cmd==="note"?[[n.pitch,n.start*16,n.duration*16]]:[]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
test("every printed notehead, onset, duration and rest survives the archival transcription",()=>{
 const {audio}=read(hymn.harmony);assert.equal(hymn.key,"F");assert.equal(hymn.meter,"4/4");
 assert.equal(audio.tracks.length,2);assert.equal(audio.totalDuration*4,65);
 for(const [voice,bars]of [upper,lower].entries()){
  let time=0;const expected:number[][]=[];
  bars.forEach((groups,bar)=>{
   const lengths=(voice===0?upperLengths:lowerLengths)[bar];assert.equal(groups.length,lengths.length);
   groups.forEach((pitches,i)=>{for(const pitch of pitches)expected.push([pitch,time,lengths[i]]);time+=lengths[i];});
  });
  assert.equal(time,260);assert.deepEqual(timeline(audio.tracks[voice]),expected.sort((a,b)=>a[1]-b[1]||a[0]-b[0]),`printed staff ${voice}`);
 }
});
test("three verses have their own underlay and share one complete engraved refrain",()=>{
 const words=(s:string[])=>s.join(" ").replace(/- /g,"");
 assert.equal(hymn.stanzas.length,3);assert(hymn.stanzas.every(s=>s.syllables.length===66));
 assert.match(words(hymn.stanzas[0].syllables.slice(0,36)),/^There's a land that is fairer than day,/);
 assert.match(words(hymn.stanzas[1].syllables.slice(0,36)),/Not a sigh for the blessing of rest\.$/);
 assert.match(words(hymn.stanzas[2].syllables.slice(0,36)),/And the blessings that hallow our days\.$/);
 const refrain="In the sweet by and by, We shall meet on that beautiful shore; In the sweet by and by, We shall meet on that beautiful shore.";
 for(const stanza of hymn.stanzas)assert.equal(words(stanza.syllables.slice(36)),refrain);
 const {tune}=read(hymnLyricsAbc(arrangeHymn(hymn,"original",0).abc,{hymn,selected:[1,2,3],offset:0}));
 const notes=tune.lines.flatMap(l=>l.staff?.[0]?.voices?.[0]||[]).filter(n=>n.el_type==="note"&&n.pitches?.length);
 assert(notes.slice(0,36).every(n=>n.el_type==="note"&&n.lyric?.length===3));
 assert(notes.slice(36).every(n=>n.el_type==="note"&&n.lyric?.length===1));
});
test("all four editions retain the final quarter rest and repeat the complete 65-beat form",()=>{
 for(const arrangement of ["original","guitar-vocal","piano","guitar-edition"] as const){
  const score=arrangeHymn(hymn,arrangement,0),{audio}=read(score.abc);
  assert.equal(score.totalBars,17);assert.equal(audio.totalDuration*4,65);
  assert(audio.tracks.every(t=>t.every(n=>n.cmd!=="note"||(n.start+n.duration)*4<=64)),`${arrangement}: written closing silence`);
  const plan=hymnPlaybackScore({hymn,arrangement,sectionBars:0,section:0,hands:"both",totalBars:17,sections:1,abc:score.abc,audio,transpose:0,stanzas:[1,2,3]});
  assert.deepEqual(plan.verses.map(v=>[v.number,v.start,v.end]),[[1,0,65],[2,65,130],[3,130,195]]);
  assert.equal(plan.audio.totalDuration*4,195);
 }
});
