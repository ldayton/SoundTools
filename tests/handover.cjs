const assert=require('node:assert/strict');
const {PraatStream}=require('../dist/praat-stream.js');
const {createProcessor}=require('../dist/vendor/praat/processor.js');
const make=require('../dist/vendor/praat/build-release/praat-spectrogram.js');
(async()=>{
 const processor=createProcessor({load:make});let calls=0,maxCalls=0,gate=null,blocked=false;
 const analyse=async request=>{
  calls++;maxCalls=Math.max(maxCalls,calls);
  try{
   if(gate&&request.windowSeconds===.015){blocked=true;await gate.promise;gate=null;}
   const result=await processor.handle(request);assert(!result.error,result.error);return result;
  }finally{calls--;}
 };
 const rate=8000,pcm=Float32Array.from({length:rate*2},(_,i)=>.2*Math.sin(i*2*Math.PI*233/rate)+.1*Math.cos(i*2*Math.PI*911/rate));
 const config=windowSeconds=>({windowSeconds,timeStep:.005,maximumFrequency:3500,frequencyStep:10});
 let requested=config(.025),commits=[],failures=[],live=[];
 const stream=new PraatStream({client:{analyse,dispose(){}},sampleRate:rate,settings:()=>requested,onFrames:frames=>live.push(...frames),onError:e=>{throw e},onReconfigured:groups=>commits.push(groups),onReconfigureError:e=>failures.push(e)});
 for(let offset=0;offset<rate;offset+=800)await stream.push(pcm.slice(offset,offset+800),offset/rate);
 const originalRaw=stream.rawBytes;requested=config(.04);await stream.reconfigure();assert.equal(commits.length,1);assert.equal(stream.rawBytes,originalRaw);
 const rebuilt=commits[0].flatMap(group=>group.frames),fresh=[];
 const oracle=new PraatStream({client:{analyse,dispose(){}},sampleRate:rate,settings:()=>requested,onFrames:frames=>fresh.push(...frames),onError:e=>{throw e}});
 for(let offset=0;offset<rate;offset+=800)await oracle.push(pcm.slice(offset,offset+800),offset/rate);
 assert.equal(rebuilt.length,fresh.length);
 for(let i=0;i<fresh.length;i++){assert(Math.abs(fresh[i].time-rebuilt[i].time)<1e-10);assert.deepEqual(rebuilt[i].power,fresh[i].power);}
 // A superseded in-flight replay must never commit, including when more live
 // input arrives while the worker is occupied by that old replay.
 gate={};gate.promise=new Promise(resolve=>gate.resolve=resolve);requested=config(.015);const old=stream.reconfigure();
 while(!blocked)await new Promise(resolve=>setImmediate(resolve));
 const incoming=stream.push(pcm.slice(rate,rate+800),1);
 requested=config(.064);const latest=stream.reconfigure();gate.resolve();
 await Promise.all([old,latest,incoming]);assert.equal(commits.length,2);assert.equal(stream.activeSettings.windowSeconds,.064);assert.equal(maxCalls,1);assert.equal(failures.length,0);
 const end=commits.at(-1).flatMap(group=>group.frames).at(-1).time;
 live=[];await stream.push(pcm.slice(rate+800,rate+1600),1.1);
 assert(live.length>0);assert(Math.abs(live[0].time-end-.005)<1e-8,'Commit skipped or duplicated a frame');
 // A failing rebuild keeps the active configuration and live source usable.
 const originalAnalyse=stream.client.analyse;stream.client.analyse=async r=>{if(r.windowSeconds===.02)throw Error('Deliberate rebuild failure');return originalAnalyse(r)};
 requested=config(.02);await stream.reconfigure();assert.equal(failures.length,1);assert.equal(stream.activeSettings.windowSeconds,.064);assert(!stream.closed);
 stream.client.analyse=originalAnalyse;
 const before=live.length;await stream.push(pcm.slice(rate+1600,rate+2400),1.2);assert(live.length>before);
 // Pausing a microphone resets its cursor without losing the PCM needed to
 // reanalyse the earlier side of the gap under later settings changes.
 const retained=stream.rawBytes;stream.reset({keepHistory:true});assert.equal(stream.rawBytes,retained);
 await stream.push(pcm.slice(0,800),2);await stream.push(pcm.slice(800,1600),2.1);
 requested=config(.04);await stream.reconfigure();
 const acrossGap=commits.at(-1).flatMap(group=>group.frames);
 assert(acrossGap.some(frame=>frame.time<1));assert(acrossGap.some(frame=>frame.time>2));
 assert(!acrossGap.some(frame=>frame.time>1.5&&frame.time<2),'Rebuild fabricated frames in the capture gap');
 // Retention is independent of the current visible duration and bounded.
 assert(stream.rawBytes<=24*1024*1024);stream.reset();assert.equal(stream.rawBytes,0);assert.equal(stream.raw.length,0);
 stream.dispose();oracle.dispose();
 console.log('PASS: real WASM rebuild/fresh equivalence, atomic cursor handover, stale cancellation, serialized worker, live continuation and failure recovery');
})().catch(error=>{console.error(error);process.exitCode=1});
