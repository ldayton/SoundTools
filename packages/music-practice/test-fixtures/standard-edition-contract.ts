import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../src/hymns.json";
import { arrangeHymn } from "../src/hymn-arrangements";
import { chordEdition } from "../src/instrument-editions";
import { capoAudio } from "../src/edition-score";

export function standardEditionContract(slug:string, expected:{bars:number;beats:number;attacks:number;capo:number;opening:number[];closing:number[]}) {
  const hymn=hymns.find(h=>h.slug===slug)!;
  const profile=chordEdition(hymn)!;
  const read=(abc:string,capo=0)=>{
    const tune=abcjs.parseOnly(abc)[0];assert.equal(tune.warnings?.length||0,0,tune.warnings?.join("\n"));
    const audio=capoAudio(tune.setUpAudio({qpm:60,chordsOff:true}),capo);
    return {tune,audio,tracks:audio.tracks.map(t=>t.filter(n=>n.cmd==="note").map(n=>[n.pitch,n.start*4,n.duration*4]))};
  };
  test(`${slug}: every source melody attack, rhythm, pickup and ending survives both instrumental editions`,()=>{
    const melody=read(hymn.melody).tracks[0];
    assert.equal(melody.length,expected.attacks);assert.deepEqual(melody.slice(0,expected.opening.length).map(n=>n[0]),expected.opening);
    assert.deepEqual(melody.slice(-expected.closing.length).map(n=>n[0]),expected.closing);
    for(const arrangement of ["piano","guitar-edition"] as const){
      const full=arrangeHymn(hymn,arrangement,0), score=read(full.abc,arrangement==="piano"?0:expected.capo);
      assert.equal(full.totalBars,expected.bars);assert.equal(score.audio.totalDuration*4,expected.beats);
      assert.deepEqual(score.tracks[0],melody.map(([p,s,d])=>[p-(arrangement==="piano"?0:12),s,d]));
      for(const size of [2,4]){
        const first=arrangeHymn(hymn,arrangement,size);let elapsed=0;const combined:number[][]=[];
        for(let section=0;section<first.sections;section++){
          const part=read(arrangeHymn(hymn,arrangement,size,section).abc,arrangement==="piano"?0:expected.capo);
          combined.push(...part.tracks[0].map(([p,s,d])=>[p,s+elapsed,d]));elapsed+=part.audio.totalDuration*4;
        }
        assert.deepEqual(combined,score.tracks[0]);assert.equal(elapsed,expected.beats);
      }
    }
  });
  test(`${slug}: held guitar notes use distinct strings and piano chords fit a fifth`,()=>{
    const guitar=read(arrangeHymn(hymn,"guitar-edition",0).abc,expected.capo);
    for(const time of [...new Set(guitar.tracks.flat().map(n=>n[1]))]){
      const sounding=guitar.tracks.flat().filter(n=>n[1]<=time+1e-8&&n[1]+n[2]>time+1e-8);
      const barTimes=[...guitar.tune.lines.flatMap(l=>l.staff?.[0]?.voices?.[0]||[])];
      let cursor=0,bar=0;for(const n of barTimes){if(n.el_type==="bar" && cursor<=time/4+1e-8 && cursor>0)bar++;if(n.el_type==="note")cursor+=n.duration;if(cursor>time/4+1e-8)break;}
      const fingers=guitar.tracks.flatMap((track,voice)=>track.filter(n=>n[1]<=time+1e-8&&n[1]+n[2]>time+1e-8).flatMap(n=>profile.fingers("guitar",bar,voice,[n[0]]).filter(Boolean)));
      assert.equal(new Set(fingers).size,fingers.length,JSON.stringify({time,fingers}));
      const positions=sounding.map(([pitch])=>profile.position(pitch-expected.capo,true));
      assert(positions.every(Boolean),JSON.stringify(sounding));assert.equal(new Set(positions.map(p=>p!.str)).size,positions.length,JSON.stringify({time,sounding,positions}));
      assert(positions.every(p=>p!.num>=0&&p!.num<=4));
    }
    const piano=read(arrangeHymn(hymn,"piano",0).abc);
    const groups=new Map<number,number[]>();for(const [p,t]of piano.tracks[1]){const group=groups.get(t)||[];group.push(p);groups.set(t,group);}
    for(const [time,pitches]of groups){assert(Math.max(...pitches)-Math.min(...pitches)<=7);const melody=piano.tracks[0].filter(n=>n[1]<=time&&n[1]+n[2]>time);assert(melody.every(n=>Math.max(...pitches)<n[0]),JSON.stringify({time,pitches,melody}));}
    for(const hands of ["right","left"] as const)assert.deepEqual(read(arrangeHymn(hymn,"piano",0,0,hands).abc).tracks[0],piano.tracks[hands==="right"?0:1]);
  });
}
