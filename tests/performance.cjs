const assert=require('node:assert/strict');
const {PerformanceSession}=require('../dist/performance.js');let now=0;
const p=new PerformanceSession({now:()=>now,limit:4});p.add('disabled',2);assert.deepEqual(p.report().metrics,{});p.enabled=true;
for(const n of [1,2,3,4,5,6])p.add('bounded',n);const m=p.report().metrics.bounded;assert.equal(m.retained,4);assert.equal(m.count,6);assert.equal(m.max,6);assert.equal(m.mean,3.5);assert.equal(m.p50,4);
const frame=(time,plotted,active=true)=>{now=time;p.frame({time,cost:2,audioTime:plotted+.3,plotted,active})};
frame(2100,1);frame(2117,1.017);frame(2300,1.017);frame(2500,1.4);
assert.equal(p.report().counts.plotStallsOver100ms,1);assert.equal(p.report().counts.animationGapsOver100ms,2);assert.ok(p.report().metrics.plotAdvanceIntervalMs.max>=383);
frame(2600,1.4,false);frame(2700,1.4);frame(4700,2);assert.equal(p.report().counts.plotStallsOver100ms,1,'Intentional pause must not register a stall');
now=6000;assert.equal(p.report().currentPlotStallMs,1300,'Report must expose a stall still in progress');p.reset();p.event('captureDiscontinuities',{gapMs:5});assert.equal(p.report().events[0].warmup,true);assert.equal(p.report().counts.captureDiscontinuities,1);assert.equal(p.report().counts.captureDiscontinuitiesAfterWarmup,undefined);now+=2100;p.event('captureDiscontinuities',{gapMs:10});assert.equal(p.report().events[1].warmup,false);assert.equal(p.report().counts.captureDiscontinuitiesAfterWarmup,1);p.reset();assert.deepEqual(p.report().metrics,{});assert.deepEqual(p.report().counts,{});assert.equal(p.enabled,true);console.log('PASS: bounded diagnostics, percentiles, injected stalls, disabled collection, pause exclusion and reset');
(async()=>{
 const {PraatStream}=require('../dist/praat-stream.js');let release;const events=[];let delivered=0;
 const stream=new PraatStream({sampleRate:1000,client:{analyse:()=>new Promise(resolve=>{release=resolve}),dispose(){}},onFrames:()=>delivered++,onError:e=>{throw e},onEvent:name=>events.push(name)});
 stream.push(new Float32Array(200),0);assert.equal(stream.busy,true);
 for(let packet=0;packet<21;packet++)stream.push(new Float32Array(100),.2+packet*.1);assert.ok(events.includes('backlogResets'),'Sustained worker overload must be counted');assert(stream.pending.length<=2000);
 stream.push(new Float32Array(10),3);assert.ok(events.includes('captureDiscontinuities'),'Missing PCM must be counted');
 release({frames:0,bins:0,firstTime:0,timeStep:.005,features:[],timings:{}});await new Promise(resolve=>setImmediate(resolve));assert.equal(delivered,0,'Stale pre-reset analysis must not be delivered');stream.dispose();
 // A bounded burst caused by a blocked UI is recoverable. The first worker
 // reply is held while eight real capture-sized packets arrive contiguously.
 let unblock,first=true;const frames=[],burstEvents=[],batchLengths=[];
 const burst=new PraatStream({sampleRate:1000,client:{analyse:request=>{
  const count=20;batchLengths.push((request.batchSteps||1)*count);
  const result={frames:count,bins:1,firstTime:request.firstCentre,timeStep:request.timeStep,power:new Float32Array(count).fill(1),features:[],timings:{}};
  if(first){first=false;return new Promise(resolve=>{unblock=()=>resolve(result)})}return Promise.resolve(request.batchSteps?{batches:Array.from({length:request.batchSteps},(_,i)=>({...result,offset:i*request.batchDuration}))}:result);
 },dispose(){}},onFrames:batch=>frames.push(...batch),onError:e=>{throw e},onEvent:name=>burstEvents.push(name)});
 const completed=burst.push(new Float32Array(200),0),generation=burst.generation;
 for(let packet=0;packet<8;packet++)burst.push(new Float32Array(100),.2+packet*.1);
 assert(burstEvents.includes('backlogHighWater'));assert(!burstEvents.includes('backlogResets'));
 unblock();await completed;assert(batchLengths.some(n=>n>20),'Catch-up must amortize worker deliveries');assert(batchLengths.every(n=>n<=80),'Catch-up batches must remain bounded');assert.equal(burst.generation,generation);assert(frames.length>150);
 for(let i=1;i<frames.length;i++)assert(Math.abs(frames[i].time-frames[i-1].time-.005)<1e-9,'Capture burst lost a frame');
 burst.dispose();console.log('PASS: bounded burst catch-up, sustained overload reset, capture gaps and stale result rejection');
})().catch(e=>{console.error(e);process.exitCode=1});
