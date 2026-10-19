// Reuse hash-verified production observations; recompute only the new acoustic measure.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const F=require('../../dist/feature-state.js'),{eligible,temporal,candidateCorrelation}=require('./temporal-filters.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'outputs/pitch-comparison/voicing-comparison');fs.mkdirSync(out,{recursive:true});
const cached=JSON.parse(fs.readFileSync(path.join(root,'outputs/pitch-comparison/periodicity/results-full.json'))),clips=[];
for(const clip of cached.clips){const file=path.join(root,clip.file),original=fs.readFileSync(file);assert.equal(crypto.createHash('sha256').update(original).digest('hex'),clip.sourceSha256);const bytes=execFileSync('ffmpeg',['-v','error','-i',file,'-t',clip.category==='cleaner-speech-control'?'8':clip.category==='far-field-speech'?'4':'5','-ar','48000','-ac','1','-f','f32le','pipe:1'],{maxBuffer:8000000});assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),clip.pcmSha256);
const decoded=execFileSync('ffmpeg',['-v','error','-f','f32le','-ar','48000','-ac','1','-i','pipe:0','-ar','16000','-f','f32le','pipe:1'],{input:bytes,maxBuffer:8000000}),pcm=new Float32Array(decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.length));
const rows=clip.rows.map(r=>({...r,correlation:eligible(r)?candidateCorrelation(pcm,16000,r.time,r.pitch):null}));
const methods={baseline:rows,periodicity35:rows.map(r=>eligible(r)&&r.periodicity&&r.periodicity.difference>=.35?{...r,pitch:0,strength:0}:r)};
for(const n of [4,6,8])methods['run'+n]=temporal(rows,{minimumFrames:n});
for(const threshold of [.15,.25,.35])methods['hybrid6-'+threshold]=temporal(rows,{minimumFrames:6,rescueDifference:threshold});
methods.pastSupport=temporal(rows,{minimumFrames:6,supportSeconds:.3});
methods.bothSupport=temporal(rows,{minimumFrames:6,supportSeconds:.15,pastOnly:false});
methods.pastHybrid25=temporal(rows,{minimumFrames:6,rescueDifference:.25,supportSeconds:.3});
for(const threshold of [.2,.4,.6])methods['correlation'+threshold]=rows.map(r=>eligible(r)&&r.correlation!==null&&r.correlation<threshold?{...r,pitch:0,strength:0}:r);
const variants={};for(const [name,filtered]of Object.entries(methods)){const points=F.points(filtered,F.presets.voice);variants[name]={retained:filtered.filter(eligible).length,groups:points.filter(p=>p.hz>0).length,highGroups:points.filter(p=>p.hz>400),rejected:rows.filter((r,i)=>eligible(r)&&!eligible(filtered[i])).map(r=>r.time),points};}
clips.push({id:clip.id,file:clip.file,category:clip.category,sourceSha256:clip.sourceSha256,pcmSha256:clip.pcmSha256,rows,variants});console.log(clip.id,clip.category);
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({warning:'Retention, not annotated accuracy. Temporal rules use future observations. Cached production analysis; new acoustic scores recomputed from verified PCM.',clips},null,2));
for(const name of Object.keys(clips[0].variants)){const speech=clips.filter(c=>c.category==='far-field-speech'),control=clips.find(c=>c.category==='cleaner-speech-control'),noise=clips.filter(c=>!['far-field-speech','cleaner-speech-control'].includes(c.category));console.log(name,JSON.stringify({speech:speech.reduce((n,c)=>n+c.variants[name].retained,0),control:control.variants[name].retained,spikes:control.variants[name].highGroups.length,noise:noise.reduce((n,c)=>n+c.variants[name].retained,0)}));}
