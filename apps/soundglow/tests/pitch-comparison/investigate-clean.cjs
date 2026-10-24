// Local diagnostic: same pinned PCM and production WASM, no product changes.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PraatStream}=require('../../dist/praat-stream.js'),F=require('../../dist/feature-state.js');
(async()=>{
 const root=path.resolve(__dirname,'../..'),out=path.join(root,'outputs/pitch-comparison/detector-investigation');fs.mkdirSync(out,{recursive:true});
 const bytes=fs.readFileSync(path.join(root,'outputs/pitch-comparison/audit-v2/case-00.f32')),pcm=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)),rate=48000;
 const m=await require('../../dist/vendor/praat/build-release/praat-spectrogram.js')();
 function analyse(data,floor,ceiling){const ptr=m._malloc(data.byteLength);try{m.HEAPF32.set(data,ptr>>>2);const count=m._sg_features(ptr,data.length,rate,6,5500,floor,ceiling);if(count<0)throw Error(m.UTF8ToString(m._sg_error()));const base=m._sg_features_data()>>>2,values=m.HEAPF32.slice(base,base+count*10),features=[];for(let i=0;i<values.length;i+=10)features.push({time:values[i],pitch:values[i+7],intensity:values[i+8],strength:values[i+9]});return features}finally{m._free(ptr)}}
 const variants={};
 for(const [floor,ceiling]of [[50,1200],[60,900],[75,600]]){
  const rows=[];let error;const stream=new PraatStream({retain:false,sampleRate:rate,settings:()=>({windowSeconds:.025,timeStep:.005,analysisFlags:6,pitchFloor:floor,pitchCeiling:ceiling}),client:{dispose(){},analyse:async r=>({features:analyse(r.pcm,floor,ceiling),frames:0,bins:0,power:new Float32Array(),timings:{}})},onFrames:(_,r)=>rows.push(...r.features),onError:e=>error=e});
  for(let i=0;i<pcm.length;i+=4800)await stream.push(pcm.slice(i,i+4800),i/rate);stream.dispose();if(error)throw error;
  variants[`stream-${floor}-${ceiling}`]={rows,points:F.points(rows,F.legacyVoice)};
 }
 // Keep the same 100 ms output grid but give Praat 0.5/1 s of context.
 for(const duration of [.5,1]){const rows=[];for(let t=.05;t+.1+(duration-.1)/2<=pcm.length/rate+1e-6;t+=.1){const start=Math.max(0,t-(duration-.1)/2),a=Math.round(start*rate),data=pcm.slice(a,a+Math.round(duration*rate));for(const row of analyse(data,50,1200)){const time=start+row.time;if(time>=t-1e-6&&time<t+.1-1e-6)rows.push({...row,time})}}variants[`context-${duration}`]={rows,points:F.points(rows,F.legacyVoice)}}
 const baseline=JSON.parse(fs.readFileSync(path.join(root,'outputs/pitch-comparison/replay/case-00.json')));
 const digest=crypto.createHash('sha256').update(bytes).digest('hex');assert.equal(digest,baseline.pcmSha256);
 const actual=variants['stream-50-1200'].points;for(const p of actual){const old=baseline.observations.find(q=>Math.abs(q.time-p.time)<1e-6);assert(old);assert(Math.abs(old.hz-p.hz)<.01,'Replay mismatch at '+p.time)}
 const raw=variants['stream-50-1200'].rows;const ablations={};for(const [name,change]of Object.entries({baseline:{},confidence65:{confidence:.65},confidence70:{confidence:.7},ceiling600:{voicingCeiling:600},noBridge:{bridgeUnvoiced:false},noGrouping:{samplingMs:0}})){const points=F.points(raw,{...F.legacyVoice,...change});ablations[name]={voiced:points.filter(p=>p.hz>0).length,high:points.filter(p=>p.hz>400).length,highConnected:points.filter(p=>p.hz>400&&p.connected).length,lowRawAccepted:raw.filter(r=>r.pitch>0&&r.pitch<400&&r.strength>=(change.confidence??.45)).length};}console.log('ablations',ablations);
 // Independent YIN-style periodicity diagnostic, NOT the installed detector.
 const decoded=require('node:child_process').execFileSync('ffmpeg',['-v','error','-i',path.join(root,'outputs/pitch-comparison/audit-v2/case-00.wav'),'-ar','16000','-ac','1','-f','f32le','pipe:1']);const signal=new Float32Array(decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.length));const acoustic=[];
 for(const t of [.5,.97,.98,.99,1.1,2.13,2.14,2.15,2.16,2.17,2.7]){const v=Array.from(signal.slice(Math.round(t*16000)-512,Math.round(t*16000)+512));const mean=v.reduce((a,b)=>a+b,0)/v.length;for(let i=0;i<v.length;i++)v[i]-=mean;let sum=0,best=Infinity,lag=0,crossings=0;for(let i=1;i<v.length;i++)if(v[i]*v[i-1]<0)crossings++;for(let k=1;k<=266;k++){let d=0;for(let j=0;j<512;j++)d+=(v[j]-v[j+k])**2;sum+=d;const cm=sum?d*k/sum:1;if(k>=18&&cm<best){best=cm;lag=k}}acoustic.push({time:t,zcr:crossings/(v.length-1),minimumYinDifference:best,bestLagHz:16000/lag,under015:best<.15});}console.log('independent periodicity diagnostic',acoustic);
 const result={acoustic,ablations,pcmSha256:crypto.createHash('sha256').update(bytes).digest('hex'),variants};fs.writeFileSync(path.join(out,'diagnostics.json'),JSON.stringify(result,null,2));
 for(const [name,v]of Object.entries(variants)){console.log(name,'high raw',v.rows.filter(r=>r.pitch>400).length,'high groups',v.points.filter(p=>p.hz>400).map(p=>[+p.time.toFixed(2),+p.hz.toFixed(1)]));for(const t of [.95,2.15])console.log(' near',t,v.rows.filter(r=>Math.abs(r.time-t)<.08).map(r=>[+r.time.toFixed(3),+r.pitch.toFixed(1),+r.strength.toFixed(3),+r.intensity.toFixed(1)]))}
})().catch(e=>{console.error(e);process.exitCode=1});
