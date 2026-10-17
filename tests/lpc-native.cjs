// Frozen independent native Praat output. Tests cannot regenerate or approve it.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const packed=fs.readFileSync(path.join(__dirname,'fixtures/lpc-native.json.gz')),metadata=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/lpc-native.json')));
assert.equal(crypto.createHash('sha256').update(packed).digest('hex'),metadata.sha256,'Pinned native LPC fixture changed');
const reference=JSON.parse(zlib.gunzipSync(packed));assert.equal(reference.cases.length,metadata.caseCount);
function verify(actual,expected){
 assert.equal(actual.power.length,expected.power.length);assert.equal(actual.coefficients.length,expected.coefficients.length);
 const coefficientError=Math.max(...actual.coefficients.map((v,i)=>Math.abs(v-expected.coefficients[i]))),gainError=Math.abs(actual.gain/expected.gain-1);let dbError=0;
 for(let i=0;i<actual.power.length;i++){assert(Number.isFinite(actual.power[i])&&actual.power[i]>0);dbError=Math.max(dbError,Math.abs(10*Math.log10(actual.power[i]/expected.power[i])));}
 assert(coefficientError<1e-6,expected.id+' coefficients differ from native LPC');assert(gainError<1e-8,expected.id+' gain differs from native LPC');assert(dbError<.0001,expected.id+' full envelope differs from native Spectrum');
 return {coefficientError,gainError,dbError};
}
(async()=>{
 const module=await require('../dist/vendor/praat/build-release/praat-spectrogram.js')(),processor=require('../dist/vendor/praat/processor.js').createProcessor({load:async()=>module});let worstDb=0,worstCoefficient=0,worstGain=0;
 for(const fixture of reference.cases){
  const bytes=Buffer.from(fixture.pcmBase64,'base64');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),fixture.pcmSha256);const pcm=Float32Array.from({length:bytes.length/4},(_,i)=>bytes.readFloatLE(i*4));
  const result=await processor.handle({type:'lpc',pcm,sampleRate:fixture.sampleRate,...fixture.options});assert(!result.error,fixture.id+': '+result.error);
  assert.equal(result.analysisRate,fixture.options.ceiling*2);assert(Math.abs(result.centreTime-fixture.centreTime)<1e-12);assert.equal(result.frequencyStep,fixture.options.ceiling/512);
  const errors=verify(result,fixture);worstDb=Math.max(worstDb,errors.dbError);worstCoefficient=Math.max(worstCoefficient,errors.coefficientError);worstGain=Math.max(worstGain,errors.gainError);
  if(fixture===reference.cases[0]){
   const coefficients=result.coefficients.slice();coefficients[0]+=.0001;assert.throws(()=>verify({...result,coefficients},fixture));
   assert.throws(()=>verify({...result,gain:result.gain*1.01},fixture));
   const power=result.power.slice();power[100]*=2;assert.throws(()=>verify({...result,power},fixture),'A changed non-peak bin must fail');
   const wrong=await processor.handle({type:'lpc',pcm,sampleRate:fixture.sampleRate,...fixture.options,preEmphasisHz:50});assert(!wrong.error,wrong.error);assert.throws(()=>verify(wrong,fixture),'A changed preprocessing path must fail');
  }
 }
 assert.equal((await processor.handle({type:'dispose'})).disposed,true);console.log('PASS: six independent native LPC full envelopes, coefficients, gain, timing and mutation guards',JSON.stringify({worstDb,worstCoefficient,worstGain}));
})().catch(e=>{console.error(e);process.exitCode=1});
