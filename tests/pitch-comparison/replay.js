// Test-only adapter: production PraatStream and workspace renderer, explicit PCM clock.
window.runPitchComparison=async function(pcm,rate=48000){
 const host=window.soundglowSession,client=new PraatClient({workerURL:'vendor/praat/worker.js?profile=release'}),blocks=[];let time=0,pending=0,failure;
 const observations=new Map(),original=FeatureState.points;
 FeatureState.points=function(rows,...args){const points=original(rows,...args);for(const p of points)observations.set(p.time,p);return points};
 Object.assign(host,{raw:()=>blocks,state:()=>({running:true,paused:true,sampleRate:rate,time,displayedUntil:time}),analyse:async(r,o)=>{pending++;try{return await client.analyse(r,o)}catch(e){failure=e;throw e}finally{pending--}}});
 document.getElementById('pitchTab').click();document.getElementById('pitchPreset').value='soundglow';document.getElementById('pitchPreset').dispatchEvent(new Event('change'));document.getElementById('welcome').hidden=true;
 async function settle(){for(let i=0;i<3||pending;i++){await new Promise(r=>setTimeout(r,0));if(failure)throw failure}}
 try{
  for(let i=0;i<pcm.length;i+=rate/10){const data=pcm.slice(i,i+rate/10);blocks.push({pcm:data,start:i/rate});time=(i+data.length)/rate;notifyFeatures('capture');await settle();notifyFeatures('render');}
  await settle();notifyFeatures('render');await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  return {rate,duration:time,preset:host.featureState().pitch,observations:[...observations.values()].sort((a,b)=>a.time-b.time),plottedUntil:Number(document.getElementById('pitchCanvas').dataset.plottedUntil)};
 }finally{client.dispose();FeatureState.points=original}
};
