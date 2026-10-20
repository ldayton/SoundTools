const F=require('../../dist/feature-state.js');
function score(rows,ref,offset){let voiced=0,missed=0,falseVoice=0,unvoiced=0,both=0,gross=0;for(const row of rows){const index=Math.round((row.time-offset)/.01);if(index<3||index>=ref.length-3)continue;const rr=ref.slice(index-3,index+4),rv=ref[index]>0,pv=F.isVoiced?F.isVoiced(row,F.presets.soundglow):row.pitch>=50&&row.pitch<1200&&row.strength>=.45;
 // Exclude uncertain reference transition bands; report coverage rather than hide it.
 if(rr.some(h=>(h>0)!==rv))continue;
 if(rv){voiced++;if(!pv)missed++;else {both++;if(Math.abs(row.pitch-ref[index])/ref[index]>.2)gross++;}}else{unvoiced++;if(pv)falseVoice++;}}
 return {voiced,missed,unvoiced,falseVoice,both,gross};}
function continuity(rows,settings,ref,origin=0){
 const complete=rows.at(-1)?.time??0,points=F.points(rows,settings).filter(p=>!settings.samplingMs||p.time+settings.samplingMs/2000<=complete+1e-8);let previous=null;const result={segments:0,connections:0,longReferenceGapsBridged:0,breaksWithinReferenceVoicing:0};
 for(const p of points){if(!p.hz)continue;if(!p.connected)result.segments++;else result.connections++;
  if(previous&&ref){const a=Math.ceil((previous.time-origin)/.01),b=Math.floor((p.time-origin)/.01);if(a>=0&&b<ref.length&&b>a){const interval=ref.slice(a,b+1);let run=0,longGap=false;for(const hz of interval){run=hz?0:run+1;if(run>=10)longGap=true;}if(p.connected&&longGap)result.longReferenceGapsBridged++;if(!p.connected&&interval.every(h=>h>0))result.breaksWithinReferenceVoicing++;}}
  previous=p;
 }
 return result;
}
module.exports={score,continuity};
