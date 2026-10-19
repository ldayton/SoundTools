// Interval metrics require explicit labels; unknown/unannotated time is not scored.
function score(observations,annotations,duration,{maxHoldSeconds=.15}={}){
 if(!Number.isFinite(maxHoldSeconds)||maxHoldSeconds<=0)throw Error("Invalid hold duration");
 if(!Number.isFinite(duration)||duration<=0)throw Error('Invalid duration');let end=0;
 for(const a of annotations){if(!['voiced','nonvoice','unknown'].includes(a.label)||!Number.isFinite(a.start)||!Number.isFinite(a.end)||(a.hz!==undefined&&(!Number.isFinite(a.hz)||a.hz<=0))||a.start<end||a.end<=a.start||a.end>duration)throw Error('Invalid annotation');end=a.end;}
 let voiced=0,kept=0,noise=0,falsePositive=0,pitchTotal=0,pitchCorrect=0;
 for(const a of annotations){if(a.label==='voiced'){voiced+=a.end-a.start;if(a.hz)pitchTotal+=a.end-a.start}else if(a.label==='nonvoice')noise+=a.end-a.start}
 let previous=-1;
 for(const o of observations){if(!Number.isFinite(o.time)||o.time<0||o.time>duration||o.time<=previous||!Number.isFinite(o.hz)||o.hz<0)throw Error('Invalid observation');previous=o.time;}
 for(let i=0;i<observations.length;i++){
  const o=observations[i],next=Math.min(observations[i+1]?.time??duration,o.time+maxHoldSeconds);
  for(const a of annotations){const dt=Math.max(0,Math.min(next,a.end)-Math.max(o.time,a.start));if(!dt||a.label==='unknown')continue;
   if(a.label==='voiced'){if(o.hz>0)kept+=dt;if(Number.isFinite(a.hz)&&a.hz>0){if(o.hz>0&&Math.abs(1200*Math.log2(o.hz/a.hz))<=50)pitchCorrect+=dt}}
   else {if(o.hz>0)falsePositive+=dt}
  }
 }
 return {voicedSeconds:voiced,nonvoiceSeconds:noise,voicingRecall:voiced?kept/voiced:null,falseAlarmRate:noise?falsePositive/noise:null,pitchAccuracy:pitchTotal?pitchCorrect/pitchTotal:null};
}
module.exports={score};
