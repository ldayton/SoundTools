import test from "node:test";
import assert from "node:assert/strict";
import { planScoreLayout, scoreFrame } from "../src/score-layout/plan";
const SYSTEM_MIN_SPACING=1.1;
const planScoreSystems=(bars: {width:number;duration:number;breakBefore?:boolean;phraseEnd?:boolean}[],capacity:number,barDuration:number)=>
  planScoreLayout([{startWidth:0,barDuration,bars:bars.map(bar=>({...bar,minimumWidth:bar.width*1.1,naturalWidth:bar.width*1.5}))}],capacity).sections[0].breaks;
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


test("fixed system overhead is reserved and independent of flexible bar spacing", () => {
  const section={startWidth:80,barDuration:1,bars:Array.from({length:4},()=>({minimumWidth:60,naturalWidth:80,duration:1}))};
  const result=planScoreLayout([section],250).sections[0];
  assert.deepEqual(result.breaks,[1]);
  assert.deepEqual(result.systems.map(s=>[s.minimumWidth,s.naturalWidth,s.overflow]),[[200,240,0],[200,240,0]]);
});
test("indivisible overflow is reported without dropping bars or pretending to fit", () => {
  const result=planScoreLayout([{startWidth:40,barDuration:1,bars:[{minimumWidth:300,naturalWidth:400,duration:1}]}],200);
  assert.deepEqual(result.sections[0].systems,[{from:0,to:1,minimumWidth:340,naturalWidth:440,overflow:140}]);
});
test("reflow preserves physical staff size; only explicit fit-to-box prompts shrink", () => {
  assert.deepEqual(scoreFrame(300,1.5,{width:400,height:200},true),{width:600,height:300,scale:1.5,overflow:300});
  assert.deepEqual(scoreFrame(300,1.5,{width:400,height:200},false),{width:300,height:150,scale:.75,overflow:0});
});
test("layout is deterministic, leaves input unchanged and handles independent sections", () => {
  const sections=[{startWidth:30,barDuration:1,bars:[{minimumWidth:50,naturalWidth:70,duration:1}]}];
  const original=structuredClone(sections);
  assert.deepEqual(planScoreLayout(sections,300),planScoreLayout(sections,300));
  assert.deepEqual(sections,original);
  assert.equal(planScoreLayout([...sections,...sections],300).sections.length,2);
  assert.deepEqual(planScoreLayout([],300).sections,[]);
});
test("invalid geometry fails explicitly instead of propagating NaN into SVGs", () => {
  for(const width of [0,-1,Infinity,NaN]) assert.throws(()=>planScoreLayout([],width),RangeError);
  assert.throws(()=>planScoreLayout([{startWidth:0,barDuration:1,bars:[{minimumWidth:10,naturalWidth:5,duration:1}]}],100),RangeError);
  assert.throws(()=>scoreFrame(100,0,{width:100,height:100},true),RangeError);
});
