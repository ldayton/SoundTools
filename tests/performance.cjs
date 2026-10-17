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
 stream.push(new Float32Array(600),.2);assert.ok(events.includes('backlogResets'),'Slow worker overload must be counted');
 stream.push(new Float32Array(10),1);assert.ok(events.includes('captureDiscontinuities'),'Missing PCM must be counted');
 release({frames:0,bins:0,firstTime:0,timeStep:.005,features:[],timings:{}});await new Promise(resolve=>setImmediate(resolve));assert.equal(delivered,0,'Stale pre-reset analysis must not be delivered');stream.dispose();console.log('PASS: injected worker backlog and capture gap diagnostics, stale result rejection');
})().catch(e=>{console.error(e);process.exitCode=1});
