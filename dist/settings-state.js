// SPDX-License-Identifier: GPL-3.0-or-later
// Independent registry and pure settings transitions. No DOM, audio or storage.
(function(scope){
 const registry={
 "maximum": {
  "default": "5000",
  "values": [
   "2000",
   "4000",
   "3500",
   "5000",
   "8000",
   "16000",
   "20000"
  ],
  "effect": "analysis",
  "preset": true
 },
 "scale": {
  "default": "voice",
  "values": [
   "linear",
   "erb",
   "mel",
   "voice",
   "log"
  ],
  "effect": "mapping",
  "preset": true
 },
 "history": {
  "default": "6",
  "min": 3,
  "max": 30,
  "step": 1,
  "effect": "mapping",
  "preset": true
 },
 "floor": {
  "default": "50",
  "min": 30,
  "max": 100,
  "step": 1,
  "effect": "colour",
  "preset": true
 },
 "gain": {
  "default": "0",
  "min": -20,
  "max": 30,
  "step": 1,
  "effect": "colour",
  "preset": true
 },
 "window": {
  "default": "0.025",
  "values": [
   "0.005",
   "0.015",
   "0.025",
   "0.064",
   "0.04"
  ],
  "effect": "analysis",
  "preset": true
 },
 "preemphasis": {
  "default": "3",
  "min": 0,
  "max": 12,
  "step": 1,
  "effect": "preemphasis",
  "preset": true
 },
 "compression": {
  "default": "0",
  "min": 0,
  "max": 1,
  "step": 0.1,
  "effect": "colour",
  "preset": true
 },
 "colourLevels": {
  "default": "fixed",
  "values": [
   "auto",
   "fixed",
   "held"
  ],
  "effect": "normalization",
  "preset": true
 },
 "fixedMaximum": {
  "default": "100",
  "min": 60,
  "max": 120,
  "step": 1,
  "effect": "colour",
  "preset": true
 },
 "suppression": {
  "default": "10",
  "min": 0,
  "max": 30,
  "step": 1,
  "effect": "colour",
  "preset": true
 },
 "windowShape": {
  "default": "gaussian",
  "values": [
   "gaussian",
   "hann"
  ],
  "effect": "analysis",
  "preset": true
 },
 "analysisRate": {
  "default": "0",
  "values": [
   "0",
   "8000",
   "16000"
  ],
  "effect": "analysis",
  "preset": true
 },
 "frameStep": {
  "default": "0.005",
  "values": [
   "0.005",
   "0.01",
   "0.016",
   "0.02"
  ],
  "effect": "analysis",
  "preset": true
 },
 "fftPadding": {
  "default": "0",
  "values": [
   "0",
   "2"
  ],
  "effect": "analysis",
  "preset": true
 },
 "removeDC": {
  "default": "off",
  "values": [
   "off",
   "on"
  ],
  "effect": "analysis",
  "preset": true
 },
 "spectrumUnits": {
  "default": "density",
  "values": [
   "density",
   "amplitude"
  ],
  "effect": "analysis",
  "preset": true
 },
 "palette": {
  "default": "reference",
  "values": [
   "reference",
   "plasma"
  ],
  "effect": "colour",
  "preset": true
 },
 "interpolation": {
  "default": "linear",
  "values": [
   "linear",
   "bucket"
  ],
  "effect": "mapping",
  "preset": true
 },
 "frameInterpolation": {
  "default": "linear",
  "values": [
   "linear",
   "hold"
  ],
  "effect": "mapping",
  "preset": true
 },
 "peakSeconds": {
  "default": "5",
  "values": [
   "3",
   "5",
   "10"
  ],
  "effect": "normalization",
  "preset": true
 },
 "peakDecay": {
  "default": "0.995",
  "values": [
   "0.98",
   "0.995",
   "0.999"
  ],
  "effect": "normalization",
  "preset": true
 },
 "resampling": {
  "default": "praat",
  "values": [
   "praat",
   "polyphase"
  ],
  "effect": "analysis",
  "preset": true
 },
 "resampleQuality": {
  "default": "2",
  "values": [
   "0",
   "1",
   "2",
   "3",
   "4"
  ],
  "effect": "analysis",
  "preset": true
 },
 "normalizationClock": {
  "default": "audio",
  "values": [
   "audio",
   "wall"
  ],
  "effect": "normalization",
  "preset": true
 },
 "formants": {
  "default": "off",
  "values": [
   "off",
   "dots",
   "tracks",
   "both"
  ],
  "effect": "analysis",
  "preset": true
 },
 "formantCeiling": {
  "default": "5500",
  "values": [
   "5000",
   "5500",
   "6000"
  ],
  "effect": "analysis",
  "preset": true
 },
 "formantSmoothing": {
  "default": "light",
  "values": [
   "off",
   "light",
   "strong"
  ],
  "effect": "overlay",
  "preset": true
 },
 "formantFiltering": {
  "default": "on",
  "values": [
   "on",
   "off"
  ],
  "effect": "overlay",
  "preset": true
 }
};
 for(const entry of Object.values(registry)){if(entry.values)Object.freeze(entry.values);Object.freeze(entry)}Object.freeze(registry);
 const ids=Object.freeze(Object.keys(registry).filter(id=>registry[id].preset)),defaults=Object.freeze(Object.fromEntries(ids.map(id=>[id,registry[id].default])));
 function validValue(id,value){
  const entry=registry[id];if(!entry||typeof value!=='string')return false;
  if(entry.values)return entry.values.includes(value);
  const n=Number(value);return value.trim()!==''&&Number.isFinite(n)&&n>=entry.min&&n<=entry.max&&Math.abs((n-entry.min)/entry.step-Math.round((n-entry.min)/entry.step))<1e-6;
 }
 function validate(values){return !!values&&typeof values==='object'&&Object.keys(values).length===ids.length&&ids.every(id=>Object.hasOwn(values,id)&&validValue(id,values[id]))}
 function create(values=defaults,selected='soundglow'){
  if(!validate(values))throw TypeError('Incomplete or invalid settings');
  if(typeof selected!=='string'||!(['soundglow','praat','voice','custom'].includes(selected)||/^saved-[a-zA-Z0-9-]+$/.test(selected)))throw TypeError('Invalid preset identity');
  // Snap tolerated floating-point noise to the declared step, then serialize
  // canonically so range inputs and persisted snapshots use identical strings.
  const normalized=Object.fromEntries(ids.map(id=>{
   const entry=registry[id];if(entry.values)return [id,values[id]];
   const decimals=Math.max(...[entry.min,entry.step].map(n=>(String(n).split('.')[1]||'').length));
   const n=entry.min+Math.round((Number(values[id])-entry.min)/entry.step)*entry.step;
   return [id,String(Number(n.toFixed(decimals)))];
  }));
  return Object.freeze({values:Object.freeze(normalized),selected});
 }
 function transition(state,event){
  let values,selected;
  if(event.type==='apply'){if(typeof event.selected!=='string')throw TypeError('Preset identity required');values=event.values;selected=event.selected}
  else if(event.type==='edit'){
   if(!validValue(event.id,event.value))throw TypeError('Invalid setting: '+event.id);
   values={...state.values,[event.id]:event.value};selected=state.selected.startsWith('saved-')?state.selected:'custom';
  }else throw TypeError('Unknown settings event');
  const next=create(values,selected),changed=ids.filter(id=>state.values[id]!==next.values[id]);
  const effects=[...new Set(changed.map(id=>registry[id].effect))];
  return {state:next,changed,effects};
 }
 function assertPresets(presets){for(const [name,values]of Object.entries(presets))if(!validate(values))throw TypeError('Incomplete or invalid preset: '+name)}
 const api={registry,ids,defaults,validValue,validate,create,transition,assertPresets};
 if(typeof module==='object'&&module.exports)module.exports=api;else scope.SettingsState=api;
})(typeof globalThis==='object'?globalThis:this);
