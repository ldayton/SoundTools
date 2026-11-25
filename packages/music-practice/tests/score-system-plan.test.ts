import test from "node:test";
import assert from "node:assert/strict";
import { planScoreLayout, scoreFrame, spacingBounds } from "../src/score-layout/plan";
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


test("continuation systems reserve only their measured opening ink", () => {
  const section={startWidth:80,startWidths:[80,10,10,10,10],barDuration:1,
    bars:Array.from({length:5},()=>({minimumWidth:60,naturalWidth:80,duration:1}))};
  const result=planScoreLayout([section],210).sections[0];
  assert.deepEqual(result.breaks,[1]);
  assert.equal(result.systems[0].minimumWidth,200);
  assert.equal(result.systems[1].minimumWidth,190);
  const changed={...section,startWidths:[80,10,70,10,10]};
  assert(planScoreLayout([changed],210).sections[0].systems.every(system=>system.minimumWidth<=210));
  assert.throws(()=>planScoreLayout([{...section,startWidths:[80]}],210),RangeError);
});


test("an overflowing bar range does not inflate every system header",()=>{
  const section={startWidth:20,barDuration:1,bars:Array.from({length:6},(_,index)=>({minimumWidth:60,naturalWidth:80,duration:1,breakBefore:index===2}))};
  const before=planScoreLayout([section],200).sections[0];
  assert.deepEqual(before.breaks,[1,3]);
  const constrained={...section,rangeMinimums:[{from:0,to:2,minimumWidth:220}]};
  const after=planScoreLayout([constrained],200).sections[0];
  assert(!after.systems.some(system=>system.from===0&&system.to===2));
  assert(after.systems.some(system=>system.to-system.from===2&&system.minimumWidth===140),'Unaffected pairs keep their original width');
  assert.deepEqual(planScoreLayout([section],200).sections[0],before,'Refinement does not mutate the input');
  assert.throws(()=>planScoreLayout([{...section,rangeMinimums:[{from:2,to:1,minimumWidth:0}]}],200),RangeError);
});


test("fixed clearance does not scale up with long text or rhythmic width",()=>{
  assert.deepEqual(spacingBounds(40,60),{minimumWidth:44,naturalWidth:60});
  assert.deepEqual(spacingBounds(400,600),{minimumWidth:404,naturalWidth:600});
  assert.deepEqual(spacingBounds(40,40),{minimumWidth:44,naturalWidth:44});
  assert.throws(()=>spacingBounds(40,50,-1),RangeError);
});


test("measured pickup-pair overflow releases the pickup attachment without losing music",()=>{
  const plan=planScoreLayout([{startWidth:10,barDuration:1,bars:[
    {minimumWidth:40,naturalWidth:60,duration:.25},{minimumWidth:60,naturalWidth:80,duration:1}],
    rangeMinimums:[{from:0,to:2,minimumWidth:220}]}],200);
  assert.deepEqual(plan.sections[0].breaks,[0]);
  assert.equal(plan.sections[0].systems.at(-1)?.to,2);
});

test("balanced line planning matches an independent exhaustive partition oracle",()=>{
  // Enumerate every partition, rather than reusing the planner's recurrence.
  for(let seed=1;seed<=24;seed++)for(const width of [180,260,340]) {
    const bars=Array.from({length:6},(_,i)=>({minimumWidth:35+((seed*17+i*23)%45),naturalWidth:95+((seed*29+i*31)%65),duration:1}));
    const starts=[65,12,12,35,12,12];
    const score=(ends:number[])=>{
      let from=0,total=0;
      const strains:number[]=[];
      for(let index=0;index<ends.length;index++) {
        const to=ends[index],minimum=bars.slice(from,to).reduce((sum,bar)=>sum+bar.minimumWidth,0);
        const natural=bars.slice(from,to).reduce((sum,bar)=>sum+bar.naturalWidth,0),capacity=width-starts[from];
        if(minimum>capacity && to-from>1)return Infinity;
        const compress=Math.max(0,natural-capacity)/Math.max(1,natural-minimum);
        const expand=Math.max(0,capacity-natural)/Math.max(1,natural);
        const strain=compress>0?-compress:expand,final=to===bars.length;
        total+=1+compress*compress+Math.max(0,1-natural/Math.max(1,capacity))**2*(final?.7:6)
          +(final&&from>0&&to-from===1?1.5:0);
        if(index>0 && !(final&&strain>=0))total+=.5*(strains.at(-1)!-strain)**2;
        strains.push(strain);from=to;
      }
      return total;
    };
    let best=Infinity;
    for(let mask=0;mask<32;mask++) {
      const ends=Array.from({length:5},(_,i)=>i+1).filter((_,i)=>mask&(1<<i));ends.push(6);
      best=Math.min(best,score(ends));
    }
    const actual=planScoreLayout([{startWidth:65,startWidths:starts,barDuration:1,bars}],width).sections[0];
    assert.equal(actual.systems.at(-1)?.to,6);
    assert(Math.abs(score(actual.systems.map(system=>system.to))-best)<1e-8,`seed ${seed}, width ${width}`);
  }
});
