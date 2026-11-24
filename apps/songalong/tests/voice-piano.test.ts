import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
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
  test(`${hymn.slug}: independent vocal melody and unchanged complete source accompaniment`,()=>{
    const score=arrangeHymn(hymn,"original",0), {tune,audio,notes}=read(score.abc);
    assert.equal(tune.lines[0].staff?.length,3);
    assert.deepEqual(notes[0],read(hymn.melody).notes[0]);
    assert.deepEqual(notes.slice(1),read(hymn.harmony).notes);
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
