const fs=require('node:fs'),assert=require('node:assert/strict'),{SpeechDetector}=require('../dist/vendor/praat/speech-detector.js'),{PitchContour}=require('../dist/pitch-contour.js');
(async()=>{const lib=(await WebAssembly.instantiate(fs.readFileSync('dist/vendor/praat/speech-vad.wasm'))).instance.exports;
 for(const rate of [16000,32000,44100,48000,96000]){
  const pcm=Float32Array.from({length:rate},(_,i)=>i<rate/3?0:.12*Math.sin(2*Math.PI*180*i/rate)+.04*Math.sin(2*Math.PI*360*i/rate));
  const all=new SpeechDetector(lib,rate),expected=all.push(pcm,4);all.dispose();assert(expected.length>=99&&expected.length<=100);assert(expected.every((f,i)=>Math.abs(f.time-(4+(i+.5)*.01))<1e-9));
  const split=new SpeechDetector(lib,rate),actual=[];for(let i=0;i<pcm.length;i+=173)actual.push(...split.push(pcm.slice(i,i+173),4+i/rate));assert.deepEqual(actual,expected,'Speech decisions independent of packetization');split.dispose();
  const silent=new SpeechDetector(lib,rate);assert(silent.push(new Float32Array(rate),0).every(f=>!f.speech));assert.throws(()=>silent.push(new Float32Array(100),3),/Discontinuous/);silent.dispose();assert.throws(()=>silent.push(new Float32Array(100),1));
 }
 // Check the 44.1 -> 16 kHz anti-aliasing itself, independently of VAD decisions.
 function amplitude(hz){const memory=new WebAssembly.Memory({initial:2}),captured=[],fake={memory,fvad_new:()=>1,fvad_set_mode:()=>0,fvad_set_sample_rate:()=>0,malloc:()=>4096,free(){},fvad_free(){},fvad_process:(_,ptr,n)=>{captured.push(...new Int16Array(memory.buffer,ptr,n));return 0}};
  const detector=new SpeechDetector(fake,44100);detector.push(Float32Array.from({length:44100},(_,i)=>.5*Math.sin(2*Math.PI*hz*i/44100)),0);detector.dispose();const steady=captured.slice(1600,-1600);return Math.sqrt(steady.reduce((s,v)=>s+(v/32768)**2,0)/steady.length);}
 assert(amplitude(4000)>.3,'Passband voice harmonics retained');assert(amplitude(10000)<.01,'Out-of-band energy cannot alias into speech evidence');
 const rows=Array.from({length:20},(_,i)=>({time:i*.01,pitch:200,strength:.8,speech:i>=10}));assert.equal(new PitchContour({speechGate:true}).push(rows).filter(r=>r.pitch>0).length,10);assert.deepEqual(new PitchContour({speechGate:false}).push(rows),rows);
 console.log('PASS: real speech WASM, silence, absolute grids, 44.1 kHz resampling, packet invariance, reset/disposal and independent gate switch');
})().catch(e=>{console.error(e);process.exitCode=1});
