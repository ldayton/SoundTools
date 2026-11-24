import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {arrangeHymn} from "../../../packages/music-practice/src/hymn-arrangements";
const notes=(abc:string)=>{const tune=abcjs.parseOnly(abc)[0];assert.equal(tune.warnings?.length||0,0);return tune.setUpAudio({chordsOff:true}).tracks.map(t=>t.flatMap(n=>n.cmd==="note"?[[n.pitch,n.start,n.duration]]:[]));};
test("dedicated Piano retains independent authored hands through complete and sliced scores",()=>{
 for(const hymn of hymns)for(const size of [0,2,4]){
  const first=arrangeHymn(hymn,"piano",size);
  for(let section=0;section<first.sections;section++){
   const full=notes(arrangeHymn(hymn,"piano",size,section).abc);
   assert.equal(full.length,2,hymn.title);
   for(const[hand,index]of [["right",0],["left",1]] as const)
    assert.deepEqual(notes(arrangeHymn(hymn,"piano",size,section,hand).abc)[0],full[index],`${hymn.title} ${hand} ${section}`);
  }
 }
});
test("retired stage requests resolve to the identical dedicated piano music",()=>{
 for(const hymn of hymns)for(const legacy of ["bass","chords","broken"] as const)
  assert.deepEqual(notes(arrangeHymn(hymn,legacy,0).abc),notes(arrangeHymn(hymn,"piano",0).abc),hymn.title);
});
