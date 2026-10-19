// Local-only corpus preparation; verifies original inputs before decoding.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),out=path.resolve(root,process.env.PITCH_COMPARISON_OUT||'outputs/pitch-comparison'),manifest=require('./manifest.json');
fs.mkdirSync(out,{recursive:true});for(const name of ['start.flag','status.json'])if(fs.existsSync(path.join(out,name)))fs.unlinkSync(path.join(out,name));
if(manifest.gain!==1||manifest.preset!=='voice'||manifest.history!==10||manifest.minimum!==50||manifest.maximum!==500)throw Error('This harness supports original levels and the fixed Voice Tools preset');const hash=b=>crypto.createHash('sha256').update(b).digest('hex');let sample=0;const schedule=[],chunks=[];
const ids=process.argv.slice(2);for(const id of ids)if(!manifest.clips.some(c=>c.id===id))throw Error('Unknown clip: '+id);
const selected=ids.length?manifest.clips.filter(c=>c.id==='case-00'||ids.includes(c.id)):manifest.clips;
for(const clip of selected){
 const original=fs.readFileSync(path.join(root,clip.file));if(hash(original)!==clip.sha256)throw Error('Input checksum mismatch: '+clip.id);
 const pcm=execFileSync('ffmpeg',['-v','error','-i',path.join(root,clip.file),'-t',String(clip.seconds),'-ar','48000','-ac','1','-f','f32le','pipe:1'],{maxBuffer:8000000});
 fs.writeFileSync(path.join(out,clip.id+'.f32'),pcm);execFileSync('ffmpeg',['-v','error','-y','-f','f32le','-ar','48000','-ac','1','-i','pipe:0',path.join(out,clip.id+'.wav')],{input:pcm});
 const silence=Buffer.alloc(48000*4*manifest.silenceSeconds);chunks.push(silence,pcm);sample+=silence.length/4;const start=sample/48000;sample+=pcm.length/4;
 schedule.push({...clip,start,end:sample/48000,pcmSha256:hash(pcm)});
}
chunks.push(Buffer.alloc(48000*4*3));fs.writeFileSync(path.join(out,'playlist.f32'),Buffer.concat(chunks));fs.writeFileSync(path.join(out,'run.json'),JSON.stringify({version:1,runId:crypto.randomUUID(),created:new Date().toISOString(),...manifest,rate:48000,clips:schedule},null,2));console.log('Prepared '+schedule.length+' verified clips in '+out);
