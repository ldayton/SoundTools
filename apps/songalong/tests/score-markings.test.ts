import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {arrangeHymn} from "../../../packages/music-practice/src/hymn-arrangements";
import {instrumentEditionIds,instrumentEdition} from "../../../packages/music-practice/src/instrument-editions";
import {prepareScoreMarkings,isScoreSectionStart} from "../../../packages/music-practice/src/score-markings";

for(const id of instrumentEditionIds){
 const hymn=hymns.find(h=>h.id===id)!,edition=instrumentEdition(hymn)!;
 test(`${hymn.slug}: clean engraving preserves all instrument music and section boundaries`,()=>{
  for(const arrangement of ["piano",edition.guitarArrangement,"original","guitar-vocal"] as const){
   if((arrangement==="original"||arrangement==="guitar-vocal")&&!edition.original)continue;
   const abc=arrangeHymn(hymn,arrangement,0).abc;
   const original=abcjs.parseOnly(abc)[0],clean=abcjs.parseOnly(abc)[0];
   const expected=original.setUpAudio({qpm:60,chordsOff:true});
   const boundaries=original.lines.flatMap(l=>l.staff||[]).flatMap(s=>s.voices||[]).flat().filter(n=>n.el_type==="part").length;
   prepareScoreMarkings(clean);
   assert.deepEqual(clean.setUpAudio({qpm:60,chordsOff:true}),expected);
   const items=clean.lines.flatMap(l=>l.staff||[]).flatMap(s=>s.voices||[]).flat();
   assert(!items.some(n=>n.el_type==="part"));
   assert(!items.some(n=>"barNumber" in n));
   assert(items.filter(isScoreSectionStart).length<=boundaries);
   assert(!items.some(n=>n.el_type==="note"&&n.chord?.some((c:{name:string})=>c.name==="Let ring")));
  }
 });
}
test("section breaks remain available without printed part labels, and bar numbers are opt-in",()=>{
 const abc='X:1\nM:4/4\nL:1/4\nQ:1/4=72\n%%barnumbers 1\nK:C\n[P:Verse] "^Let ring"C4 | D4 | [P:Chorus] E4 | F4 |]';
 const read=()=>abcjs.parseOnly(abc)[0];
 const clean=read();prepareScoreMarkings(clean);
 const notes=clean.lines.flatMap(l=>l.staff?.[0]?.voices?.[0]||[]).filter(n=>n.el_type==="note");
 assert.deepEqual(notes.map(isScoreSectionStart),[true,false,true,false]);
 assert.equal((clean.metaText.tempo as typeof clean.metaText.tempo & {suppress?:boolean})?.suppress,true);
 const numbered=read();prepareScoreMarkings(numbered,true);
 const count=(t:typeof clean)=>JSON.stringify(t).match(/"barNumber":/g)?.length||0;
 assert.equal(count(clean),0);assert(count(numbered)>0);
});
