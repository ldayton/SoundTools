const assert=require('node:assert/strict'),fs=require('node:fs');
const {createProcessor}=require('../dist/vendor/praat/processor.js');
const {powerDb,intensity}=require('../dist/praat-display.js');
assert(Math.abs(powerDb(4e-10,1000))<1e-10);
assert(Math.abs(powerDb(4e-10,2000)-6)<1e-10);
assert(Math.abs(powerDb(4e-10,500)+6)<1e-10);
assert.equal(intensity(100,100),1);assert.equal(intensity(30,100),0);assert.equal(intensity(65,100),.5);assert(Number.isFinite(powerDb(0,0)));
const create=require('../dist/vendor/praat/build-release/praat-spectrogram.js');
const {PraatStream}=require('../dist/praat-stream.js');
function wav(path){const b=fs.readFileSync(path);let rate,channels,bits,pcm;for(let p=12;p+8<b.length;){const id=b.toString('ascii',p,p+4),n=b.readUInt32LE(p+4),o=p+8;if(id==='fmt '){assert.equal(b.readUInt16LE(o),1);channels=b.readUInt16LE(o+2);rate=b.readUInt32LE(o+4);bits=b.readUInt16LE(o+14)}if(id==='data'){assert.equal(bits,16);pcm=new Float32Array(n/2/channels);for(let i=0;i<pcm.length;i++){for(let c=0;c<channels;c++)pcm[i]+=b.readInt16LE(o+(i*channels+c)*2)/32768/channels}}p=o+n+(n%2)}return {pcm,rate}}
// Exercise the actual worklet code with deterministic quantum/channel inputs.
const vm=require('node:vm');
for(const rate of [24000,44100,48000]){
 let Worklet;const sent=[];const context={Float32Array,sampleRate:rate,currentFrame:0,AudioWorkletProcessor:class{constructor(){this.port={postMessage:data=>sent.push(data)}}},registerProcessor:(_,type)=>{Worklet=type}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('dist/pcm-worklet.js','utf8'),context);
 const worklet=new Worklet();for(let i=0;i<Math.ceil(rate*.31/128);i++){context.currentFrame=i*128;worklet.process([[new Float32Array(128).fill(.2),new Float32Array(128).fill(-.1)]])}
 assert.equal(sent.length,3);for(let i=0;i<3;i++){assert.equal(sent[i].pcm.length,Math.round(rate*.1));assert(Math.abs(sent[i].start-i*.1)<1e-10);assert(sent[i].pcm.every(x=>Math.abs(x-.05)<1e-6))}
 // Empty input quanta between real audio must occupy their clock time as
 // silence, including when a partial packet crosses the disconnect boundary.
 const intermittent=new Worklet(),offset=sent.length;let clock=0,expected=[];
 for(let q=0;q<Math.ceil(rate*.21/128);q++){
  const present=q%7!==3;context.currentFrame=clock;
  intermittent.process(present?[[new Float32Array(128).fill(.25)]]:[[]],[[new Float32Array(128)]]);
  expected.push(...Array(128).fill(present?.25:0));clock+=128;
 }
 for(let i=offset;i<sent.length;i++){
  const packet=sent[i],start=(i-offset)*Math.round(rate*.1);
  assert.equal(packet.start,start/rate);assert.deepEqual(Array.from(packet.pcm),expected.slice(start,start+packet.pcm.length));
 }
 worklet.port.onmessage();assert.equal(worklet.used,0);
}
(async()=>{
 const module=await create();
 const p=createProcessor({load:async()=>module});
 const analyse=async r=>{const result=await p.handle(r);if(result.error)throw new Error(result.error);return result};
 const speech=wav('dist/audio/speech-english.wav');assert.equal(speech.rate,24000);
 for(const rate of [24000,44100,48000])for(const windowSeconds of [.005,.015,.025,.04]){
  const pcm=rate===24000?speech.pcm.slice(0,rate):Float32Array.from({length:rate},(_,i)=>.2*Math.sin(2*Math.PI*1000*i/rate));
  let full;const frames=[];let failure;
  const stream=new PraatStream({client:{analyse,dispose(){}},sampleRate:rate,settings:()=>({windowSeconds}),onFrames:r=>frames.push(...r),onError:e=>{failure=e}});
  const step=Math.round(rate*.1);
  for(let start=0;start+step<=pcm.length;start+=step){stream.push(pcm.slice(start,start+step),start/rate);while(stream.busy)await new Promise(r=>setImmediate(r))}
  if(failure)throw failure;
  assert(frames.length>150);
  // Praat centres its frame grid within the finite sound. Floating-point
  // endpoint rounding can select a half-hop phase; compare matching grids.
  for(let n=9;n>=2;n--){const size=Math.round(rate*(.1*n+2*windowSeconds));if(size>pcm.length)continue;const candidate=await analyse({pcm:pcm.slice(0,size),sampleRate:rate,windowSeconds});if(Math.abs(candidate.firstTime-frames[0].time)<1e-8){full=candidate;break}}
  assert(full,'A matching continuous reference grid must exist');
  for(let i=0;i<frames.length;i++){
   assert(Math.abs(frames[i].time-(frames[0].time+i*.005))<1e-8,`Duplicate/missing frame at block seam ${rate}/${windowSeconds}/${i}: ${frames[i].time}, full first ${full.firstTime}`);
   const fullIndex=Math.round((frames[i].time-full.firstTime)/full.timeStep);
   if(fullIndex>=full.frames)continue;
   const reference=full.power.subarray(fullIndex*full.bins,(fullIndex+1)*full.bins);
   let difference=0,peak=0;for(let f=0;f<reference.length;f++){difference=Math.max(difference,Math.abs(reference[f]-frames[i].power[f]));peak=Math.max(peak,reference[f])}
   assert(difference<Math.max(1e-8,peak*1e-4),`Block differs from continuous analysis: ${rate}/${windowSeconds}/${i}: ${difference}/${peak}`);
  }
  stream.dispose();
 }
 // A late response from before a seek must not enter the new timeline.
 let release,got=0;const delayed=new PraatStream({client:{analyse:()=>new Promise(r=>release=r),dispose(){}},sampleRate:24000,onFrames:()=>got++,onError:e=>{throw e}});
 delayed.push(new Float32Array(4800),0);delayed.reset();release({frames:1,bins:1,firstTime:.025,timeStep:.005,power:new Float32Array([1])});await new Promise(r=>setImmediate(r));assert.equal(got,0);delayed.dispose();
 let nonzero=0;for(let start=0;start<speech.pcm.length;start+=speech.rate){const whole=await analyse({pcm:speech.pcm.slice(start,start+speech.rate),sampleRate:speech.rate});for(const v of whole.power){assert(Number.isFinite(v)&&v>=0);if(v>0)nonzero++}}assert(nonzero>10000);
 console.log(`PASS: real WASM English speech (${speech.pcm.length/speech.rate}s), 12 rate/window combinations, block/full numerical equivalence, continuous timestamps, stale seek rejection`);
})().catch(e=>{console.error(e);process.exitCode=1});
