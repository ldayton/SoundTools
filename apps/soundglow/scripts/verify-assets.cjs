const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const directory=path.join(__dirname,'../dist/vendor/praat/build-release'),manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),report={profile:manifest.profile,source:manifest.sourceInputsSha256,assets:[]};
try{assert.equal(manifest.profile,'release');for(const name of ['praat-spectrogram.js','praat-spectrogram.wasm']){const expected=manifest.assets[name],bytes=fs.readFileSync(path.join(directory,name)),actual=crypto.createHash('sha256').update(bytes).digest('hex');report.assets.push({name,expected:expected.sha256,actual,bytes:bytes.length});assert.equal(actual,expected.sha256,`${name}: package hash mismatch`);assert.equal(bytes.length,expected.bytes)}console.log('PASS: vendored engine asset hashes')}catch(error){report.error=error.message;process.exitCode=1;console.error(error.message)}finally{fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/assets.json',JSON.stringify(report,null,2))}
const speechPath=path.join(directory,'../speech-vad.wasm'),speech=fs.readFileSync(speechPath),speechPin=JSON.parse(fs.readFileSync(path.join(directory,'../speech-manifest.json')));assert.equal(crypto.createHash('sha256').update(speech).digest('hex'),speechPin.sha256,'Speech engine hash mismatch');assert.equal(speech.length,speechPin.bytes);console.log('PASS: vendored speech engine asset hash');
// Optional speech confirmation has its own pinned directory; it is not mandatory offline cache data.
const neuralPin=JSON.parse(fs.readFileSync(path.join(directory,'../neural-manifest.json')));
assert(/^[a-f0-9]{32}$/.test(neuralPin.version),'Invalid neural asset version');
const neuralDirectory=path.resolve(directory,'../../neural',neuralPin.version),neuralHash=crypto.createHash('sha256');
for(const [name,pin] of Object.entries(neuralPin.files)){
 assert(name===path.basename(name),'Invalid neural asset name');const bytes=fs.readFileSync(path.join(neuralDirectory,name));assert.equal(bytes.length,pin.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),pin.sha256,'Neural asset mismatch:'+name);neuralHash.update(name+'\0');neuralHash.update(bytes);
}
assert.equal(neuralHash.digest('hex').slice(0,32),neuralPin.version);console.log('PASS: optional neural model/runtime/license asset hashes');
