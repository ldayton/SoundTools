const fs=require('node:fs'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {reference,load}=require('./fixture.cjs');
const create=require('../../dist/vendor/praat/build-release/praat-spectrogram.js');
const {createProcessor}=require('../../dist/vendor/praat/processor.js');
const {PraatStream}=require('../../dist/praat-stream.js');
(async()=>{
 fs.rmSync('test-results/numeric',{recursive:true,force:true});
 const report={settings:reference.settings,expected:reference.expected,tolerance:reference.tolerance};let actual;
 try{
  const input=load('english.f32.gz'),expectedBytes=load('native-power.f64.gz');const pcm=new Float32Array(input.buffer.slice(input.byteOffset,input.byteOffset+input.length));
  const p=createProcessor({load:create}),frames=[];let metadata,failure;
  const stream=new PraatStream({client:{analyse:async request=>{const r=await p.handle(request);if(r.error)throw Error(r.error);return r},dispose(){}},sampleRate:reference.settings.sampleRate,settings:()=>reference.settings,onFrames:(batch,result)=>{frames.push(...batch);metadata=result},onError:e=>{failure=e}});
  for(let i=0;i<pcm.length;i+=2400){stream.push(pcm.slice(i,i+2400),i/24000);while(stream.busy)await new Promise(r=>setImmediate(r));if(failure)throw failure}
  const expected=reference.expected,common=frames.filter(f=>f.time<=10+1e-10);assert.equal(common.length,expected.frames,'Frame count');assert.equal(metadata.bins,expected.bins,'Frequency bins');
  for(const key of ['timeStep','firstFrequency','frequencyStep'])assert(Math.abs(metadata[key]-expected[key])<1e-10,`Metadata: ${key}`);
  assert.equal(expectedBytes.length,expected.frames*expected.bins*8);actual=Buffer.alloc(common.length*metadata.bins*4);
  let sum=0,energy=0,maxError=0,peak=0,worst=null;
  for(let t=0;t<common.length;t++){
   assert(Math.abs(common[t].time-(expected.firstTime+t*expected.timeStep))<1e-10,`Timestamp at frame ${t}`);assert.equal(common[t].power.length,expected.bins);
   for(let f=0;f<expected.bins;f++){const index=t*expected.bins+f,a=expectedBytes.readDoubleLE(index*8),b=common[t].power[f];assert(Number.isFinite(a)&&a>=0&&Number.isFinite(b)&&b>=0,`Invalid power at ${index}`);actual.writeFloatLE(b,index*4);const error=Math.abs(a-b);if(error>maxError){maxError=error;worst={frame:t,bin:f,expected:a,actual:b,time:common[t].time,frequency:metadata.firstFrequency+f*metadata.frequencyStep}}peak=Math.max(peak,a);sum+=(a-b)**2;energy+=a*a}
  }
  Object.assign(report,{cells:common.length*metadata.bins,relativeRMSE:Math.sqrt(sum/energy),maximumAbsoluteError:maxError,peakRelativeMaxError:maxError/peak,worst});
  assert(report.relativeRMSE<reference.tolerance.relativeRMSE,'Relative RMS error exceeds native reference tolerance');assert(maxError<=peak*reference.tolerance.peakRelativeMaxError+reference.tolerance.absoluteErrorFloor,'Maximum cell error exceeds native reference tolerance');
  report.passed=true;console.log(`PASS: ${report.cells} native/WASM power cells; relative RMS ${report.relativeRMSE.toExponential(3)}`);
 }catch(error){report.passed=false;report.error=error.stack||error.message;process.exitCode=1;console.error(error.message);if(actual){fs.mkdirSync('test-results/numeric',{recursive:true});fs.writeFileSync('test-results/numeric/actual.f32.gz',zlib.gzipSync(actual))}}
 finally{fs.mkdirSync('test-results/numeric',{recursive:true});fs.writeFileSync('test-results/numeric/report.json',JSON.stringify(report,null,2));fs.writeFileSync('test-results/numeric/reference.json',JSON.stringify(reference,null,2))}
})().catch(error=>{console.error(error);process.exitCode=1});
