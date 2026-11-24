import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import { arrangeHymn } from "../../../packages/music-practice/src/hymn-arrangements";
import { hymnPlaybackScore } from "../../../packages/music-practice/src/hymn-playback-score";
import { capoAudio } from "../../../packages/music-practice/src/edition-score";
import { hymnLyricsAbc } from "../../../packages/music-practice/src/hymn-lyrics";
import { standardEditionContract } from "../../../packages/music-practice/test-fixtures/standard-edition-contract";

const slug="are-you-washed-in-the-blood", hymn=hymns.find(h=>h.slug===slug)!;
standardEditionContract(slug,{bars:17,beats:64,attacks:75,capo:1,opening:[60,63,68,68,68,63,60,63],closing:[63,63,63,68,67,67,68]});

// Independently read from the supplied Hoffman/Kravchuk A-flat SATB print,
// SHA256 8a1c871e60f4143c5f4e427cbb1e6335f9941a7f9f72fde342b9c740c9bed54c.
// Each row is a printed measure; negative pitches are rests. Durations are eighths.
const rhythms=["11","221111","22211","211211","611","221111","22211","211211","611","611","611","211211","611","221111","22211","211211","6"];
const lowerRhythms=[...rhythms.slice(0,8),"62","21122","211211","211211","211211",...rhythms.slice(13)];
const printed=[
  [[60,63],[68,68,68,63,60,63],[68,68,68,68,70],[72,72,72,72,70,68],[70,68,67],[68,68,68,72,70,68],[65,65,65,65,65],[63,63,63,68,67,67],[68,72,70],[68,68,67],[65,67,65],[63,68,70,72,73,72],[70,72,70],[68,68,68,72,70,68],[65,65,65,65,65],[63,63,63,68,67,67],[68]],
  [[56,60],[60,60,60,60,56,60],[60,61,60,63,63],[63,63,63,63,63,62],[63,63,61],[60,60,60,63,63,63],[61,61,61,61,61],[60,60,60,63,61,61],[60,63,61],[60,60,63],[61,63,61],[60,63,63,63,63,63],[63,63,61],[60,60,60,63,63,63],[61,61,61,61,61],[60,60,60,63,61,61],[60]],
  [[51,51],[51,51,51,56,56,56],[56,53,51,56,55],[56,56,56,56,58,58],[55,56,51],[51,51,51,56,55,56],[56,56,56,56,56],[56,56,56,60,58,58],[56,-1],[-1,56,56,56,-1],[-1,56,56,56,56,56],[56,56,55,56,58,56],[55,55,55,55,56,51],[51,51,51,56,55,56],[56,56,56,56,56],[56,56,56,60,58,51],[51]],
  [[44,44],[44,44,44,44,44,44],[44,49,44,48,51],[56,56,56,56,55,53],[51,51,51],[44,44,44,44,46,48],[49,49,49,49,49],[51,51,51,51,51,51],[44,-1],[-1,44,44,44,-1],[-1,49,49,49,49,49],[44,48,51,56,55,56],[51,51,51,51,51,51],[44,44,44,44,46,48],[49,49,49,49,49],[51,51,51,51,51,51],[44]],
];
function read(abc:string){
  const tune=abcjs.parseOnly(abc)[0];assert.equal(tune.warnings?.length||0,0,tune.warnings?.join("\n"));
  return {tune,audio:tune.setUpAudio({qpm:60,chordsOff:true})};
}
const notes=(track:ReturnType<typeof read>["audio"]["tracks"][number])=>track.flatMap(n=>n.cmd==="note"?[[n.pitch,n.start*8,n.duration*8]]:[]);
test("printed SATB: every pitch, rhythm, rest, accidental and final partial measure",()=>{
  const score=read(hymn.harmony);assert.equal(hymn.key,"Ab");assert.equal(hymn.meter,"4/4");
  assert.equal(score.audio.totalDuration*4,64);assert.equal(score.audio.tracks.length,4);
  printed.forEach((bars,voice)=>{
    let time=0;const expected:number[][]=[];
    bars.forEach((pitches,bar)=>{
      const lengths=(voice<2?rhythms:lowerRhythms)[bar].split("").map(Number);
      assert.equal(pitches.length,lengths.length,`print fixture voice ${voice}, bar ${bar}`);
      pitches.forEach((pitch,i)=>{if(pitch>=0)expected.push([pitch,time,lengths[i]]);time+=lengths[i];});
    });
    assert.equal(time,128);assert.deepEqual(notes(score.audio.tracks[voice]),expected,`printed voice ${voice}`);
  });
  // In particular, Bb7/F has D-natural, not the key-signature D-flat.
  const vocal=read(arrangeHymn(hymn,"original",0).abc);
  const chords=new Map<number,string>(),clocks=new Map<string,number>();
  for(const l of vocal.tune.lines)for(const [s,staff]of(l.staff||[]).entries())for(const [v,voice]of(staff.voices||[]).entries()){
    const key=`${s}:${v}`;let time=clocks.get(key)||0;
    for(const n of voice)if(n.el_type==="note"){
      const chord=n.chord?.find((c:{position:string;name:string})=>c.position==="default");if(chord)chords.set(time*64,chord.name.replaceAll("♭","b").replaceAll("♯","#"));time+=n.duration;
    }clocks.set(key,time);
  }
  assert.equal(chords.get(200),"Bb7/F");
  for(const offset of [256,400,768,912])assert.equal(chords.get(offset),"Ab/Eb","source slash bass stays distinct from the root-bass instrumental adaptation");
  assert.deepEqual(vocal.audio.tracks.slice(1).map(notes),score.audio.tracks.map(notes),"source harmony stays intact beside the independent voice");
});
test("both instrumental adaptations retain the secondary dominant's D-natural",()=>{
  for(const [arrangement,expected]of [["piano",[44,46,50]],["guitar-edition",[41,50,56]]] as const){
    const {audio}=read(arrangeHymn(hymn,arrangement,0).abc);
    const tracks=arrangement==="guitar-edition"?capoAudio(audio,1).tracks:audio.tracks.slice(1);
    const sounding=tracks.flatMap(notes).filter(([,start,length])=>start<=25&&start+length>25).map(n=>n[0]).sort((a,b)=>a-b);
    assert.deepEqual(sounding,expected,"D-flat would erase the written Bb7 harmony");
  }
});
test("four printed verses share one engraved refrain and repeat the whole form during playback",()=>{
  assert.equal(hymn.stanzas.length,4);assert(hymn.stanzas.every(s=>s.syllables.length===75));
  const words=(tokens:string[])=>tokens.join(" ").replace(/- /g,"");
  assert.match(words(hymn.stanzas[0].syllables.slice(0,40)),/^Have you been to Jesus for the cleansing power\?/);
  assert.match(words(hymn.stanzas[1].syllables.slice(0,40)),/Do you rest each moment in the Crucified\?/);
  assert.match(words(hymn.stanzas[2].syllables.slice(0,40)),/Will your soul be ready for the mansions bright,/);
  assert.match(words(hymn.stanzas[3].syllables.slice(0,40)),/There's a fountain flowing for the soul unclean, O be washed in the blood of the Lamb!/);
  const refrain="Are you washed in the blood, In the soulcleansing blood of the Lamb? Are your garments spotless? Are they white as snow? Are you washed in the blood of the Lamb?";
  for(const stanza of hymn.stanzas)assert.equal(words(stanza.syllables.slice(40)),refrain);
  const engraved=read(hymnLyricsAbc(arrangeHymn(hymn,"original",0).abc,{hymn,selected:[1,2,3,4],offset:0})).tune;
  const melody=engraved.lines.flatMap(l=>l.staff?.[0]?.voices?.[0]||[]).filter(n=>n.el_type==="note");
  assert(melody.slice(0,40).every(n=>n.el_type==="note"&&n.lyric?.length===4));
  assert(melody.slice(40).every(n=>n.el_type==="note"&&n.lyric?.length===1));
  for(const arrangement of ["original","guitar-vocal","piano","guitar-edition"] as const){
    const score=arrangeHymn(hymn,arrangement,0),{audio}=read(score.abc);
    const plan=hymnPlaybackScore({hymn,arrangement,sectionBars:0,section:0,hands:"both",totalBars:17,sections:1,abc:score.abc,audio,transpose:0,stanzas:[1,2,3,4]});
    assert.deepEqual(plan.verses.map(v=>[v.number,v.start,v.end]),[[1,0,64],[2,64,128],[3,128,192],[4,192,256]]);
    assert.equal(plan.audio.totalDuration*4,256);
    const single=notes((arrangement==="guitar-edition"?capoAudio(audio,1):audio).tracks[0]);
    assert.deepEqual(notes(plan.audio.tracks[0]),[0,128,256,384].flatMap(offset=>single.map(([p,s,d])=>[p,s+offset,d])));
  }
});
