// SPDX-License-Identifier: GPL-3.0-or-later
// Optional, UI-independent feedback tools. No analysis runs until explicitly called.
(function(scope){
 const finitePositive=n=>Number.isFinite(n)&&n>0;
 class FormantTracker{
  constructor({smoothingSeconds=0,maxGapSeconds=.025,maxJumpOctaves=.22,minStrength=.45,relativeFloorDb=35}={}){
   if(!Number.isFinite(smoothingSeconds)||smoothingSeconds<0||smoothingSeconds>.2||!finitePositive(maxGapSeconds)||maxGapSeconds>.2||!finitePositive(maxJumpOctaves)||!Number.isFinite(minStrength)||minStrength<0||minStrength>1||!finitePositive(relativeFloorDb))throw RangeError('Invalid formant tracking options');
   Object.assign(this,{smoothingSeconds,maxGapSeconds,maxJumpOctaves,minStrength,relativeFloorDb});this.reset();
  }
  reset(){this.previous=[null,null,null];this.lastTime=null}
  push(row,{referenceIntensity=row.intensity}={}){
   if(!Number.isFinite(row.time))throw TypeError('Finite frame time required');
   if(this.lastTime!==null&&row.time<=this.lastTime)this.reset();
   this.lastTime=row.time;
   const voiced=finitePositive(row.pitch)&&Number.isFinite(row.strength)&&row.strength>=this.minStrength;
   const audible=Number.isFinite(row.intensity)&&Number.isFinite(referenceIntensity)&&row.intensity>=referenceIntensity-this.relativeFloorDb;
   return {time:row.time,smoothingSeconds:this.smoothingSeconds,qualityKind:'heuristic-not-probability',formants:[0,1,2].map(i=>{
    const raw=row.formants?.[i],bandwidth=row.bandwidths?.[i];
    const valid=finitePositive(raw)&&raw>=90&&raw<7500&&finitePositive(bandwidth)&&bandwidth<Math.min(700,raw*.45);
    if(!voiced||!audible||!valid){this.previous[i]=null;return {rawHz:Number.isFinite(raw)?raw:null,hz:null,quality:0,connected:false,reason:!voiced?'unvoiced-or-weak':!audible?'quiet':'invalid-frequency-or-bandwidth'}}
    const prior=this.previous[i],dt=prior?row.time-prior.time:0;
    const linked=!!prior&&dt>0&&dt<=this.maxGapSeconds&&Math.abs(Math.log2(raw/prior.raw))<this.maxJumpOctaves;
    const alpha=this.smoothingSeconds? -Math.expm1(-dt/this.smoothingSeconds):1;
    const hz=linked?Math.exp(Math.log(prior.hz)+alpha*(Math.log(raw)-Math.log(prior.hz))):raw;
    this.previous[i]={time:row.time,hz,raw};
    return {rawHz:raw,hz,bandwidthHz:bandwidth,quality:Math.max(0,Math.min(1,row.strength*(1-bandwidth/Math.min(700,raw*.45)))),connected:linked,reason:linked?'tracked':'new-segment'};
   })};
  }
 }
 function validateTarget(target){
  if(!target||typeof target.id!=='string'||!target.id.trim()||typeof target.vowel!=='string'||!target.vowel.trim()||typeof target.language!=='string'||!target.language.trim()||!finitePositive(target.centreHz)||target.centreHz>8000||!finitePositive(target.halfWidthHz)||target.halfWidthHz>=target.centreHz||target.centreHz+target.halfWidthHz>8000)throw TypeError('A target needs an id, vowel, language, centreHz and valid halfWidthHz');
  return {id:target.id.trim(),vowel:target.vowel.trim(),language:target.language.trim(),centreHz:target.centreHz,halfWidthHz:target.halfWidthHz};
 }
 function relativeTarget({baselineHz,shiftSemitones=0,...target}){
  if(!finitePositive(baselineHz)||!Number.isFinite(shiftSemitones)||Math.abs(shiftSemitones)>24)throw RangeError('Invalid baseline or relative shift');
  return validateTarget({...target,centreHz:baselineHz*Math.pow(2,shiftSemitones/12)});
 }
 class VowelTargets{
  constructor(targets=[]){this.targets=[];for(const t of targets)this.set(t)}
  set(target){const t=validateTarget(target),i=this.targets.findIndex(x=>x.id===t.id);if(i<0)this.targets.push(t);else this.targets[i]=t;return {...t}}
  delete(id){this.targets=this.targets.filter(t=>t.id!==id)}
  list(){return this.targets.map(t=>({...t}))}
  save(storage,key='soundglow-vowel-targets-v1'){storage.setItem(key,JSON.stringify({version:1,targets:this.list()}))}
  static load(storage,key='soundglow-vowel-targets-v1'){const data=JSON.parse(storage.getItem(key)||'{"version":1,"targets":[]}');if(data.version!==1||!Array.isArray(data.targets))throw TypeError('Invalid target storage');return new VowelTargets(data.targets)}
  compare(id,frame,{vowel,language,nowSeconds,maxAgeSeconds=.1}={}){
   const t=this.targets.find(t=>t.id===id);if(!t)throw RangeError('Unknown vowel target');
   if(vowel!==t.vowel||language!==t.language)return {available:false,reason:'vowel-or-language-mismatch'};
   if(!Number.isFinite(nowSeconds)||!Number.isFinite(maxAgeSeconds)||maxAgeSeconds<0)throw TypeError('A finite current time and nonnegative maximum age are required');
   if(!Number.isFinite(frame?.time))return {available:false,reason:'missing-timestamp'};
   let ageSeconds=nowSeconds-frame.time;const tolerance=4*Number.EPSILON*Math.max(1,Math.abs(nowSeconds),Math.abs(frame.time));
   if(ageSeconds < -tolerance||ageSeconds>maxAgeSeconds+tolerance)return {available:false,reason:ageSeconds<0?'future-frame':'stale-frame',time:frame.time,ageSeconds};
   ageSeconds=Math.max(0,ageSeconds);
   const f2=frame.formants?.[1];if(!finitePositive(f2?.hz)||!Number.isFinite(f2.quality)||f2.quality<=0)return {available:false,reason:'unreliable-F2'};
   return {available:true,time:frame.time,ageSeconds,frequencyHz:f2.hz,offsetHz:f2.hz-t.centreHz,lowerHz:t.centreHz-t.halfWidthHz,upperHz:t.centreHz+t.halfWidthHz};
  }
 }
 function spectralSlice(frame,{firstFrequency=0,frequencyStep}={}){
  if(!finitePositive(frequencyStep)||!Number.isFinite(firstFrequency)||firstFrequency<0||!(frame?.power instanceof Float32Array)||!Number.isFinite(frame.time))throw TypeError('A timestamped power spectrum and frequency geometry are required');
  return {time:frame.time,firstFrequency,frequencyStep,power:frame.power.slice(),kind:'raw-spectrum-not-LPC'};
 }
 function bandEnergy(slice,bands){
  if(!slice||!finitePositive(slice.frequencyStep)||!Number.isFinite(slice.firstFrequency)||slice.firstFrequency<0||!(slice.power instanceof Float32Array)||!slice.power.length)throw TypeError('Invalid spectrum');
  const lowerHz=Math.max(0,slice.firstFrequency-slice.frequencyStep/2),upperHz=slice.firstFrequency+(slice.power.length-.5)*slice.frequencyStep;
  if(!Number.isFinite(upperHz))throw RangeError('Spectrum geometry overflows');
  return bands.map(({fromHz,toHz})=>{
   if(!Number.isFinite(fromHz)||!Number.isFinite(toHz)||fromHz<lowerHz||toHz<=fromHz||toHz>upperHz)throw RangeError('Invalid energy band');
   let sum=0;for(let i=0;i<slice.power.length;i++){const p=slice.power[i];if(!Number.isFinite(p)||p<0)throw TypeError('Expected nonnegative linear power');const centre=slice.firstFrequency+i*slice.frequencyStep,width=Math.max(0,Math.min(toHz,centre+slice.frequencyStep/2)-Math.max(fromHz,centre-slice.frequencyStep/2));sum+=p*width;}
   if(!Number.isFinite(sum))throw RangeError('Integrated energy overflows');
   return {fromHz,toHz,energy:sum};
  });
 }
 const api={FormantTracker,VowelTargets,relativeTarget,spectralSlice,bandEnergy};if(typeof module==='object'&&module.exports)module.exports=api;else scope.VoiceFeedback=api;
})(typeof globalThis==='object'?globalThis:this);
