// Evaluate on the reference clock, never on the detector's emitted-frame count.
const cents=(a,b)=>1200*Math.log2(a/b);
function validate(rows){let last=-Infinity;for(const r of rows){if(!Number.isFinite(r.time)||r.time<=last||!Number.isFinite(r.hz)||r.hz<0)throw Error('Invalid or unordered pitch rows');last=r.time;}}
function score(reference,prediction,{hop=.01,tolerance=.0051,transitionMask=0}={}){
 validate(reference);validate(prediction);if(![hop,tolerance,transitionMask].every(Number.isFinite)||!(hop>0)||!(tolerance>=0)||!(transitionMask>=0))throw Error('Invalid timing contract');
 const out={frames:0,excluded:0,voiced:0,unvoiced:0,missed:0,falseVoiced:0,correct50:0,correct100:0,grossFrames:0,octaveUpFrames:0,octaveDownFrames:0,octaveUpEvents:0,octaveDownEvents:0};let j=0,previous=null,lastTime=-Infinity;
 for(let i=1;i<reference.length;i++)if(Math.abs(reference[i].time-reference[i-1].time-hop)>1e-7)throw Error('Reference must use declared regular hop');
 const transitions=reference.slice(1).filter((r,i)=>(r.hz>0)!==(reference[i].hz>0)).map(r=>r.time);
 for(const r of reference){if(r.exclude||transitions.some(t=>Math.abs(r.time-t)<transitionMask)){out.excluded++;previous=null;continue;}
 while(j+1<prediction.length&&Math.abs(prediction[j+1].time-r.time)<Math.abs(prediction[j].time-r.time))j++;
 const p=prediction[j],hz=p&&Math.abs(p.time-r.time)<=tolerance?p.hz:0;out.frames++;let octave=null;
 if(r.hz>0){out.voiced++;if(!hz)out.missed++;else{const error=cents(hz,r.hz);if(Math.abs(hz/r.hz-1)>.2)out.grossFrames++;if(Math.abs(error)<=50+1e-8)out.correct50++;if(Math.abs(error)<=100+1e-8)out.correct100++;if(Math.abs(error-1200)<=100)octave='Up';if(Math.abs(error+1200)<=100)octave='Down';}}
 else {out.unvoiced++;if(hz)out.falseVoiced++;}
 if(octave){out[`octave${octave}Frames`]++;if(previous!==octave||r.time-lastTime>hop*1.5)out[`octave${octave}Events`]++;}previous=octave;lastTime=r.time;
 }
 for(const threshold of [50,100]){const correct=out[`correct${threshold}`],accepted=out.voiced-out.missed+out.falseVoiced;out[`precision${threshold}`]=accepted?correct/accepted:null;out[`recall${threshold}`]=out.voiced?correct/out.voiced:null;out[`f1_${threshold}`]=accepted+out.voiced?2*correct/(accepted+out.voiced):null;}
 out.missedSeconds=out.missed*hop;out.falseVoicedSeconds=out.falseVoiced*hop;return out;
}
module.exports={score,validate};
