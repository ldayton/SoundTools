const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {validateInputs,validateResults,identity}=require('./near-mic-integrity.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
test('source pins bind replay, control, report audio and results',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'near-integrity-'));
 const write=(p,v)=>{const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,typeof v==='object'&&!Buffer.isBuffer(v)?JSON.stringify(v):v);};
 try {
 const pcm=Buffer.alloc(48000*4),wav=Buffer.from('fixture WAV');
 const clip={id:'voice',seconds:1,wav:'audio.wav',wavSha256:hash(wav),pcmSha256:hash(pcm)};
 const control={...clip,id:'alice-control',pcm:'control.f32'};
 const pin={target:'fixture',clips:[clip]},pinPath='tests/pitch-comparison/near-mic-manifest.json',manifestPath='outputs/pitch-comparison/near-mic/manifest.json';
 write(pinPath,pin);write(manifestPath,pin);write('tests/pitch-comparison/near-mic-control.json',control);write('audio.wav',wav);write('control.f32',pcm);write('outputs/pitch-comparison/near-mic/voice.f32',pcm);
 const manifest=validateInputs(root),results={identity:identity(manifest),clips:[control,clip]};validateResults(root,results);
 const changed=Buffer.from(pcm);changed[0]=1;write('outputs/pitch-comparison/near-mic/voice.f32',changed);write(manifestPath,{...pin,clips:[{...clip,pcmSha256:hash(changed)}]});assert.throws(()=>validateInputs(root),/source pin/);
 write(manifestPath,pin);assert.throws(()=>validateInputs(root),/PCM differs/);write('outputs/pitch-comparison/near-mic/voice.f32',pcm);
 write('control.f32',changed);assert.throws(()=>validateInputs(root),/alice-control: PCM/);write('control.f32',pcm);
 // Exercise the report entry point too: failure must not overwrite an accepted report.
 write('outputs/pitch-comparison/near-mic/results.json',results);
 write('outputs/pitch-comparison/near-mic/report.html','accepted report');
 for(const name of ['report-near-mic.cjs','near-mic-integrity.cjs']) fs.copyFileSync(path.join(__dirname,name),path.join(root,'tests/pitch-comparison',name));
 fs.symlinkSync(path.resolve(__dirname,'../../dist'),path.join(root,'dist'));
 fs.unlinkSync(path.join(root,'audio.wav'));
 const run=require('node:child_process').spawnSync(process.execPath,[path.join(root,'tests/pitch-comparison/report-near-mic.cjs')]);
 assert.notEqual(run.status,0);assert.match(run.stderr.toString(),/ENOENT/);
 assert.equal(fs.readFileSync(path.join(root,'outputs/pitch-comparison/near-mic/report.html'),'utf8'),'accepted report');
 assert.throws(()=>validateResults(root,results),/ENOENT/);write('audio.wav','changed');assert.throws(()=>validateResults(root,results),/WAV differs/);write('audio.wav',wav);
 assert.throws(()=>validateResults(root,{...results,identity:'stale'}),/different corpus/);
 assert.throws(()=>validateResults(root,{...results,clips:[control,control]}),/duplicate/);
 assert.throws(()=>validateResults(root,{...results,clips:[control,{...clip,wav:'wrong.wav'}]}),/stale wav/);
 validateResults(root,results);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
