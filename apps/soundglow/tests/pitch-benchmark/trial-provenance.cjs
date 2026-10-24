const fs=require('node:fs'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const sources=['dist/workspace.js','dist/pitch-contour.js','dist/praat-stream.js','dist/vendor/praat/processor.js','dist/vendor/praat/live-worker.js','dist/vendor/praat/neural-client.js','dist/vendor/praat/neural-worker.js','dist/vendor/praat/neural-detector.js','dist/vendor/praat/neural-manifest.json','dist/vendor/praat/speech-detector.js','dist/vendor/praat/speech-vad.wasm','dist/vendor/praat/build-release/praat-spectrogram.wasm','tests/pitch-benchmark/live-gate-trial.cjs','tests/pitch-benchmark/metrics.cjs','tests/pitch-benchmark/aggregate.cjs'];
function provenance(){return {contractSha256:hash(fs.readFileSync('tests/pitch-benchmark/gate-trial.json')),sources:Object.fromEntries(sources.map(p=>[p,hash(fs.readFileSync(p))]))};}
module.exports={hash,provenance};
