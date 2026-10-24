// Produce identical measured pitch inputs for the original collection and our renderer.
const fs=require('node:fs'),{execFileSync}=require('node:child_process');
(async()=>{
 const {createProcessor}=require('../dist/vendor/praat/processor.js'),make=require('../dist/vendor/praat/build-release/praat-spectrogram.js'),processor=createProcessor({load:make}),rate=24000,cases={};
 async function measure(pcm){const features=[];let failure;const {PraatStream}=require('../dist/praat-stream.js');const stream=new PraatStream({retain:false,sampleRate:rate,client:{analyse:async request=>{const result=await processor.handle(request);if(result.error)throw Error(result.error);return result},dispose(){}},settings:()=>({windowSeconds:.025,timeStep:.005,maximumFrequency:1000,frequencyStep:20,analysisFlags:6,pitchFloor:50,pitchCeiling:1200}),onFrames:(_,result)=>features.push(...result.features),onError:e=>failure=e});for(let i=0;i<pcm.length;i+=rate/10)await stream.push(pcm.slice(i,i+rate/10),i/rate);stream.dispose();if(failure)throw failure;return features.filter(f=>f.pitch>0&&f.strength>=.45).map(f=>[f.time,f.pitch])}
 const signals={steady:t=>200,steps:t=>t<1?150:300,glide:t=>120+80*t,vibrato:t=>200+25*Math.sin(2*Math.PI*3*t),gaps:t=>t<.7||t>1.1?200:0};
 for(const [name,f] of Object.entries(signals)){
  let phase=0;const pcm=Float32Array.from({length:rate*2},(_,i)=>{const hz=f(i/rate);phase+=2*Math.PI*hz/rate;return hz?.1*(Math.sin(phase)+.4*Math.sin(2*phase)+.2*Math.sin(3*phase)):0});
  cases['audio-'+name]=await measure(pcm);
 }
 const bytes=execFileSync('ffmpeg',['-v','error','-i','dist/audio/alice-waters.m4a','-t','8','-ar',String(rate),'-ac','1','-f','f32le','pipe:1'],{maxBuffer:4000000}),pcm=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
 cases['audio-speech']=await measure(pcm);
 fs.writeFileSync(process.argv[2]||'/tmp/soundglow-pitch-inputs.json',JSON.stringify(cases));console.log(Object.fromEntries(Object.entries(cases).map(([name,rows])=>[name,rows.length])));
})().catch(e=>{console.error(e);process.exitCode=1});
