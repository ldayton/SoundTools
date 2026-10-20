// Research-only, bounded-future fallback. Original raw/corroborated decisions win.
function fallback(raw,filtered,base,{minimumStrength=.55,toleranceCents=200}={}){
 if(raw.length!==filtered.length||raw.length!==base.length)throw Error('Mismatched observations');
 for(let i=0;i<raw.length;i++)if(!Number.isFinite(raw[i].time)||i&&Math.abs(raw[i].time-raw[i-1].time-.01)>1e-6||Math.abs(raw[i].time-filtered[i].time)>1e-8||Math.abs(raw[i].time-base[i].time)>1e-8)throw Error('Mismatched time grid');
 const voiced=r=>r.pitch>=50&&r.pitch<1200&&r.strength>=.45;
 const trusted=i=>i>=0&&i<base.length&&voiced(raw[i])&&voiced(base[i])&&base[i].pitch<=500&&base[i].strength>=.6&&base[i].speech!==false;
 const out=base.map(r=>({...r}));
 for(let i=0;i<raw.length;i++){
  const r=raw[i],f=filtered[i];if(voiced(r)||voiced(base[i])||r.speech===false||!voiced(f)||f.pitch>500||f.strength<minimumStrength)continue;
  let left=-1,right=-1;
  for(let j=i-1;j>=0&&r.time-raw[j].time<=.1+1e-8;j--)if(trusted(j)&&trusted(j-1)){left=j;break;}
  for(let j=i+1;j<raw.length&&raw[j].time-r.time<=.05+1e-8;j++)if(trusted(j)&&trusted(j+1)&&raw[j+1].time-r.time<=.05+1e-8){right=j;break;}
  if(left<0||right<0)continue;
  const a=base[left],b=base[right];if(Math.abs(1200*Math.log2(a.pitch/b.pitch))>300)continue;
  const ratio=(r.time-a.time)/(b.time-a.time),reference=Math.exp(Math.log(a.pitch)*(1-ratio)+Math.log(b.pitch)*ratio);
  if(Math.abs(1200*Math.log2(f.pitch/reference))>toleranceCents)continue;
  out[i]={...base[i],pitch:f.pitch,strength:f.strength,fallback:true};
 }
 return out;
}
module.exports={fallback};
