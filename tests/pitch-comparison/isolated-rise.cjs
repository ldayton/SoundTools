// Research-only: hold very large upward changes briefly; ordinary voicing is untouched.
const {eligible}=require('./temporal-filters.cjs');
function isolatedRise(rows,{jumpCents=1800,historySeconds=.5,confirmationFrames=6}={}){
 if(!Number.isFinite(jumpCents)||jumpCents<=0||!Number.isFinite(historySeconds)||historySeconds<=0||!Number.isInteger(confirmationFrames)||confirmationFrames<1)throw Error('Invalid excursion settings');
 let last=-Infinity;for(const r of rows){if(!Number.isFinite(r.time)||r.time<=last)throw Error('Unsorted observations');last=r.time;}
 const out=rows.map(r=>({...r}));let history=[];
 for(let i=0;i<rows.length;i++){
  const r=rows[i];history=history.filter(p=>r.time-p.time<=historySeconds);if(!eligible(r))continue;
  const sorted=history.map(p=>p.pitch).sort((a,b)=>a-b),reference=sorted[Math.floor(sorted.length/2)];
  if(history.length<3||1200*Math.log2(r.pitch/reference)<jumpCents){history.push(r);continue;}
  const next=rows.slice(i,i+confirmationFrames),confirmed=next.length===confirmationFrames&&next.every((p,k)=>eligible(p)&&(!k||p.time-next[k-1].time<=.010001)&&Math.abs(1200*Math.log2(p.pitch/r.pitch))<=600);
  if(confirmed){history=[...next];i+=confirmationFrames-1;}
  else out[i]={...r,pitch:0,strength:0};
 }
 return out;
}
module.exports={isolatedRise};
