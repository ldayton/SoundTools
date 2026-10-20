// Research only: preserve raw estimates; demand independent filtered agreement above 500 Hz.
function corroborate(raw,filtered){
 if(raw.length!==filtered.length)throw Error('Mismatched observations');
 return raw.map((r,i)=>{const f=filtered[i];if(!Number.isFinite(r.time)||Math.abs(r.time-f.time)>1e-8)throw Error('Mismatched timestamps');const high=r.pitch>500&&r.strength>=.45;const agrees=f.pitch>=50&&f.pitch<1200&&f.strength>=.45&&Math.abs(1200*Math.log2(r.pitch/f.pitch))<=100;return high&&!agrees?{...r,pitch:0,strength:0}:{...r};});
}
module.exports={corroborate};
