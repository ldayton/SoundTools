import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {hymnInstrumentArrangements} from "../../../packages/music-practice/src/hymn-instruments";
import {chordEdition} from "../../../packages/music-practice/src/instrument-editions";
test("all retained songs meet the documented instrument support standard",()=>{
  const matrix=readFileSync(new URL("../../../docs/songalong-song-support.md",import.meta.url),"utf8");
  const capos:Record<string,number>={"in-christ-alone":2,"amazing-grace":0,"ill-fly-away":0,"jesus-loves-me":3,"o-come-all-ye-faithful":0,"blessed-assurance":2,"silent-night":1,"joy-to-the-world":2,"are-you-washed-in-the-blood":1,"in-the-sweet-by-and-by":3,"fairest-lord-jesus":3,"the-old-rugged-cross":3};
  for(const hymn of hymns){
    assert(matrix.includes(`| ${hymn.title} |`),hymn.title);
    const vocal=hymn.slug!=="the-1st-fingerstyle-blues";
    assert.equal(hymnInstrumentArrangements(hymn,"guitar").length,vocal?2:1,hymn.title);
    assert.deepEqual(hymnInstrumentArrangements(hymn,"piano").map(a=>a.id),vocal?["original","piano"]:["piano"],hymn.title);
    assert.equal(hymnInstrumentArrangements(hymn,"guitar").some(a=>a.id==="guitar-vocal"),vocal,hymn.title);
    if(hymn.slug in capos)assert.equal(chordEdition(hymn)!.capo,capos[hymn.slug]);
  }
});
