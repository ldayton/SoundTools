// Research filters over raw 10 ms observations; no interpolation or replacement pitch.
const eligible=r=>Number.isFinite(r.pitch)&&r.pitch>=50&&r.pitch<1200&&Number.isFinite(r.strength)&&r.strength>=.45;
function temporal(rows,{minimumFrames=6,gapSeconds=.020001,jumpCents=600,rescueDifference=null,supportSeconds=0,pastOnly=true}={}){
 if(!Number.isInteger(minimumFrames)||minimumFrames<1||!Number.isFinite(gapSeconds)||gapSeconds<=0||!Number.isFinite(jumpCents)||jumpCents<=0||rescueDifference!==null&&(!Number.isFinite(rescueDifference)||rescueDifference<=0)||!Number.isFinite(supportSeconds)||supportSeconds<0||typeof pastOnly!=='boolean')throw Error('Invalid temporal settings');
 let previous=-Infinity;for(const r of rows){if(!Number.isFinite(r.time)||r.time<=previous)throw Error('Unsorted observations');previous=r.time;}
 const keep=new Set(),runs=[];let run=[];
 function finish(){runs.push(run);if(run.length>=minimumFrames||rescueDifference!==null&&run.some(i=>!rows[i].periodicity||rows[i].periodicity.difference<rescueDifference))for(const i of run)keep.add(i);run=[];}
 for(let i=0;i<rows.length;i++){const r=rows[i];if(!eligible(r))continue;const p=rows[run.at(-1)];if(p&&(r.time-p.time>gapSeconds||Math.abs(1200*Math.log2(r.pitch/p.pitch))>jumpCents))finish();run.push(i);}finish();
 // Only independently long runs provide support; rescued runs cannot chain indefinitely.
 const anchors=runs.filter(run=>run.length>=minimumFrames).flat();
 if(supportSeconds>0)for(const run of runs){if(run.length&&run.every(i=>anchors.some(j=>(!pastOnly||rows[j].time<rows[run[0]].time)&&Math.abs(rows[j].time-rows[i].time)<=supportSeconds&&Math.abs(1200*Math.log2(rows[j].pitch/rows[i].pitch))<=jumpCents)))for(const i of run)keep.add(i);}
 return rows.map((r,i)=>eligible(r)&&!keep.has(i)?{...r,pitch:0,strength:0}:r);
}
// Mean-centered normalized correlation at the proposed period, including fractional lags.
function candidateCorrelation(pcm,rate,time,hz){
 if(!Number.isFinite(rate)||rate<8000||!Number.isFinite(time)||time<0||!Number.isFinite(hz)||hz<50||hz>=rate/2)throw Error('Invalid pitch');
 const width=Math.round(rate*.032),lag=rate/hz,start=Math.round(time*rate)-Math.floor(width/2+lag/2),offset=Math.ceil(lag*1.05);
 if(start<0||start+width+offset+1>pcm.length)return null;
 let best=-1;
 for(const factor of [.95,1,1.05]){const d=lag*factor;let sx=0,sy=0,sxx=0,syy=0,sxy=0;for(let j=0;j<width;j++){const x=pcm[start+j],k=start+j+d,a=Math.floor(k),f=k-a,y=pcm[a]*(1-f)+pcm[a+1]*f;if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Nonfinite PCM');sx+=x;sy+=y;sxx+=x*x;syy+=y*y;sxy+=x*y;}const xx=Math.max(0,sxx-sx*sx/width),yy=Math.max(0,syy-sy*sy/width);const c=xx*yy>1e-24?(sxy-sx*sy/width)/Math.sqrt(xx*yy):0;best=Math.max(best,Math.max(-1,Math.min(1,c)));}
 return best;
}
module.exports={eligible,temporal,candidateCorrelation};
