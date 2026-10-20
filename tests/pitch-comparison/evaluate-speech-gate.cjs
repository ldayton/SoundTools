// Research-only. Do not turn segment-level speech decisions into unconditional pitch truth.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const {default:make}=await import('@ozymandiasthegreat/vad'),VAD=await make(),r=JSON.parse(fs.readFileSync('outputs/pitch-comparison/practice/results.json')),results=[];
 for(const mode of [0,2])for(const c of r.clips){
  const b=fs.readFileSync(c.pcm);assert.equal(hash(b),c.pcmSha256);const pcm=new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length)),vad=new VAD(mode,48000),flags=[];
  try{for(let i=0;i+480<=pcm.length;i+=480)flags.push(vad.processFrame(VAD.floatTo16BitPCM(pcm.slice(i,i+480)))===1);}finally{vad.destroy();}
  const ref=c.files?.ref?fs.readFileSync(c.files.ref.file,'utf8').trim().split(/\n/).map(l=>+l.trim().split(/\s+/)[0]):null;
  const result={id:c.id,mode,split:c.split,condition:c.condition||'normal',accepted:0,rejected:0,below400:0,below400Rejected:0,referenceVoiced:0,referenceVoicedRejected:0,referenceUnvoiced:0,referenceUnvoicedRejected:0};
  for(const row of c.variants[0].rows){if(!(row.pitch>=50&&row.pitch<1200&&row.strength>=.45))continue;
   const at=Math.floor(row.time/.01),speech=flags.slice(Math.max(0,at-10),at+4).some(Boolean);result.accepted++;if(!speech)result.rejected++;if(row.pitch<400){result.below400++;if(!speech)result.below400Rejected++;}
   if(ref){const index=Math.round(row.time/.01);if(index<3||index>=ref.length-3)continue;const voiced=ref[index]>0;if(ref.slice(index-3,index+4).some(h=>(h>0)!==voiced))continue;const key=voiced?'referenceVoiced':'referenceUnvoiced';result[key]++;if(!speech)result[key+'Rejected']++;}
  }
  results.push(result);
 }
 fs.writeFileSync('outputs/pitch-comparison/practice/speech-gate.json',JSON.stringify({implementation:'WebRTC libfvad via pinned @ozymandiasthegreat/vad 2.0.7; 10 ms 48 kHz frames; speech evidence padded 100 ms past / 30 ms future. NOT an app default. No reference labels for AVID subsets; retention there is not accuracy.',results},null,2));
 for(const condition of ['soft','normal'])for(const mode of [0,2]){const c=results.filter(c=>c.condition===condition&&c.mode===mode);console.log(condition,mode,c.reduce((a,r)=>{for(const k of ['accepted','rejected','below400','below400Rejected','referenceVoiced','referenceVoicedRejected','referenceUnvoiced','referenceUnvoicedRejected'])a[k]=(a[k]||0)+r[k];return a;},{}));}
})().catch(e=>{console.error(e);process.exitCode=1});
