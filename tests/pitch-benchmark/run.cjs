// Explicit manifest input; no downloads, timing fitting, or hidden confidence thresholds.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {score}=require('./metrics.cjs'),{engine,measure}=require('../pitch-comparison/matched-stream.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const manifestPath=process.argv[2];if(!manifestPath)throw Error('Usage: node tests/pitch-benchmark/run.cjs manifest.json output.json');
 const manifest=JSON.parse(fs.readFileSync(manifestPath)),root=process.cwd();
 if(!manifest.timingVerified)throw Error('Reference timing must be verified before scoring');
 const seen=new Set(),speakers=new Map();for(const c of manifest.clips){if(seen.has(c.id))throw Error('Duplicate clip');seen.add(c.id);const key=c.corpus+':'+c.speaker;if(speakers.has(key)&&speakers.get(key)!==c.split)throw Error('Speaker leaks across splits');speakers.set(key,c.split);}
 const instance=await engine('production'),results=[];
 for(const c of manifest.clips){const bytes=fs.readFileSync(path.resolve(root,c.pcm));if(hash(bytes)!==c.pcmSha256)throw Error('PCM hash mismatch: '+c.id);const pcm=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));const refBytes=fs.readFileSync(path.resolve(root,c.reference));if(hash(refBytes)!==c.referenceSha256)throw Error('Reference hash mismatch');const reference=JSON.parse(refBytes);
 for(const method of ['raw','filtered','corroborated']){const start=performance.now(),run=await measure(pcm,instance,{rate:c.sampleRate,packetSamples:Math.round(c.sampleRate*.1),pitchMethod:method}),elapsedMs=performance.now()-start;
 const prediction=run.rows.map(r=>({time:r.time,hz:r.strength>=.45?r.pitch:0}));results.push({id:c.id,corpus:c.corpus,speaker:c.speaker,split:c.split,method,elapsedMs,score:score(reference,prediction,manifest.timing),prediction});}
 console.log(c.id);
 }
 const output=process.argv[3]||'outputs/pitch-benchmark/results.json';fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({manifestSha256:hash(fs.readFileSync(manifestPath)),productionProcessorSha256:hash(fs.readFileSync('dist/vendor/praat/processor.js')),wasmSha256:hash(fs.readFileSync('dist/vendor/praat/build-release/praat-spectrogram.wasm')),confidenceThreshold:.45,note:'Detector output only; excludes speech gate and line rendering. Elapsed time is offline throughput, not live latency. Raw/filtered use app analysis settings, not stock Praat defaults.',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
