import test from "node:test";
import assert from "node:assert/strict";
import { planScoreSystems, SYSTEM_MIN_SPACING } from "../src/score-system-plan";
const bars = (widths: number[]) => widths.map(width => ({width,duration:1}));

test("content and physical scale determine fitting, rather than a fixed bar count", () => {
  assert.deepEqual(planScoreSystems(bars(Array(8).fill(100)),850,1),[4]);
  assert.deepEqual(planScoreSystems(bars(Array(8).fill(100)),450,1),[2,5]);
  const dense=planScoreSystems(bars(Array(8).fill(180)),850,1);
  assert(dense.length>1);
  assert(planScoreSystems(bars(Array(8).fill(100)),850/0.675,1).length<dense.length);
});
test("pickups, opening repeats and final partial bars stay with neighbours when they fit", () => {
  const music=[{width:10,duration:0},{width:30,duration:.25},...bars([100,100,100,100]),{width:30,duration:.75}];
  const result=planScoreSystems(music,450,1);
  assert(!result.includes(0));assert(!result.includes(1));assert(!result.includes(music.length-2));
  const densePickup=[{width:200,duration:.25},...bars([200,200])];
  assert(planScoreSystems(densePickup,400,1).includes(0),"An unfit pickup pair must not overflow the phone");
});
test("every bar is retained and no fitting system exceeds its minimum width", () => {
  for(const capacity of [180,320,600,900,1200]) {
    const music=bars([40,90,120,55,180,70,85,60,110]);
    const breaks=[...planScoreSystems(music,capacity,1),music.length-1];
    let start=0;
    for(const end of breaks) {
      assert(end>=start);
      const width=music.slice(start,end+1).reduce((sum,m)=>sum+m.width,0);
      assert(width*SYSTEM_MIN_SPACING<=capacity || end===start);
      start=end+1;
    }
    assert.equal(start,music.length);
  }
});
test("empty, short and indivisible dense scores have finite plans", () => {
  assert.deepEqual(planScoreSystems([],300,1),[]);
  assert.deepEqual(planScoreSystems(bars([500]),100,1),[]);
  assert.deepEqual(planScoreSystems(bars([500,500]),100,1),[0]);
  assert.deepEqual(planScoreSystems(bars([40]),1000,1),[]);
});
test("named musical sections start a fresh system without song-specific rules", () => {
  const music=bars([60,60,60,60,60,60]);
  assert(planScoreSystems(music.map((m,index)=>({...m,breakBefore:index===3})),1000,1).includes(2));
});
test("a named ending takes precedence over a short-bar attachment", () => {
  const music=[...bars([60,60]),{width:30,duration:.25,breakBefore:true}];
  assert(planScoreSystems(music,600,1).includes(1));
});
test("a section label after an opening repeat cannot strand an empty system", () => {
  const music=[{width:10,duration:0},{width:80,duration:1,breakBefore:true},...bars([80,80,80])];
  const breaks=planScoreSystems(music,300,1);
  assert(breaks.length>0);assert(!breaks.includes(0));
  const later=[...bars([80,80]),{width:10,duration:0},{width:80,duration:1,breakBefore:true},...bars([80,80])];
  const laterBreaks=planScoreSystems(later,600,1);
  assert(laterBreaks.includes(1));assert(!laterBreaks.includes(2));
});
