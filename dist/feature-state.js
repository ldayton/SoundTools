// SPDX-License-Identifier: GPL-3.0-or-later
(function(scope){
 const defaults={minimum:50,maximum:450,history:10,smoothing:'light',bands:true,
  ranges:[{name:'Male',low:85,high:145,colour:'#70cbe1'},{name:'Androgynous',low:145,high:175,colour:'#b2b8c3'},{name:'Female',low:175,high:275,colour:'#f58caa'}]};
 function pitch(input={}){
  const p={...defaults,...input,ranges:(input.ranges||defaults.ranges).map(r=>({...r}))};
  for(const [key,min,max] of [['minimum',50,1000],['maximum',100,1200],['history',3,30]])if(!Number.isFinite(p[key])||p[key]<min||p[key]>max)throw Error('Invalid pitch '+key);
  if(p.maximum-p.minimum<50||!['off','light'].includes(p.smoothing)||typeof p.bands!=='boolean'||p.ranges.length!==3)throw Error('Invalid pitch settings');
  for(const r of p.ranges)if(typeof r.name!=='string'||!r.name.trim()||r.name.length>40||!Number.isFinite(r.low)||!Number.isFinite(r.high)||r.low<50||r.high>1200||r.low>=r.high||!/^#[a-f0-9]{6}$/i.test(r.colour))throw Error('Invalid pitch band');
  return p;
 }
 function restore(text){try{const x=JSON.parse(text);if(x.version!==1)throw Error();return {active:['pitch','spectrogram'].includes(x.active)?x.active:'spectrogram',pitch:pitch(x.pitch)}}catch{return {active:'spectrogram',pitch:pitch()}}}
 // Never connect across unvoiced frames, missing measurements, or octave jumps.
 function points(rows,{smoothing='light'}={}){
  let previous=null,filtered=null;return rows.map(row=>{
   const voiced=Number.isFinite(row.pitch)&&row.pitch>=50&&row.pitch<=1200&&row.strength>=.45;
   if(!voiced){previous=null;filtered=null;return {time:row.time,hz:0,connected:false}}
   const connected=!!previous&&row.time>previous.time&&row.time-previous.time<=.035&&Math.abs(Math.log2(row.pitch/previous.pitch))<.5;
   const alpha=connected&&smoothing==='light'?1-Math.exp(-(row.time-previous.time)/.025):1;
   filtered=connected?filtered+alpha*(row.pitch-filtered):row.pitch;previous=row;
   return {time:row.time,hz:filtered,connected,marker:Math.round(row.time*100)%4===0};
  });
 }
 const api={defaults,pitch,restore,points};if(typeof module==='object'&&module.exports)module.exports=api;else scope.FeatureState=api;
})(typeof self==='object'?self:globalThis);
