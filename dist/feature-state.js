// SPDX-License-Identifier: GPL-3.0-or-later
(function(scope){
 const defaults={method:'raw',speechGate:false,confirmationMs:0,voicingCeiling:1200,axis:'linear',drawing:'curve',edgeExtension:'none',confidence:.45,bridgeUnvoiced:false,outlineWidth:0,lineWidth:2.8,markerRadius:2,samplingMs:0,aggregation:'mean',gapMs:35,jumpCents:600,cornerRadius:0,markers:'spaced',minimum:50,maximum:450,history:10,smoothing:'light',bands:true,
  ranges:[{name:'Male',low:85,high:145,colour:'#70cbe1'},{name:'Androgynous',low:145,high:175,colour:'#b2b8c3'},{name:'Female',low:175,high:275,colour:'#f58caa'}]};
 function pitch(input={}){
  const p={...defaults,...input,ranges:(input.ranges||defaults.ranges).map(r=>({...r}))};
  for(const [key,min,max] of [['minimum',50,1000],['maximum',100,1200],['history',3,30]])if(!Number.isFinite(p[key])||p[key]<min||p[key]>max)throw Error('Invalid pitch '+key);
  if(p.maximum-p.minimum<50||!['off','light'].includes(p.smoothing)||typeof p.bands!=='boolean'||p.ranges.length!==3)throw Error('Invalid pitch settings');
  for(const r of p.ranges)if(typeof r.name!=='string'||!r.name.trim()||r.name.length>40||!Number.isFinite(r.low)||!Number.isFinite(r.high)||r.low<50||r.high>1200||r.low>=r.high||!/^#[a-f0-9]{6}$/i.test(r.colour))throw Error('Invalid pitch band');
  for(const [key,min,max] of [['voicingCeiling',100,1200],['confidence',0,1],['outlineWidth',0,6],['lineWidth',1,6],['markerRadius',1,6],['samplingMs',0,500],['gapMs',0,2000],['jumpCents',0,2400],['cornerRadius',0,40]])if(!Number.isFinite(p[key])||p[key]<min||p[key]>max)throw Error('Invalid pitch '+key);
  if(!['raw','filtered'].includes(p.method))throw Error('Invalid pitch method');
  if(typeof p.speechGate!=='boolean'||![0,30,50].includes(p.confirmationMs)||!['linear','log'].includes(p.axis)||!['curve','dots','auto'].includes(p.drawing)||!['none','half-frame'].includes(p.edgeExtension)||typeof p.bridgeUnvoiced!=='boolean'||![0,50,100,200].includes(p.samplingMs)||![0,600,1200].includes(p.jumpCents)||!['mean','continuity'].includes(p.aggregation)||!['spaced','all','off'].includes(p.markers))throw Error('Invalid pitch trace');
  return p;
 }
 const voiceDefaults={...defaults,maximum:500,lineWidth:2,markerRadius:2.5,smoothing:'off',samplingMs:100,aggregation:'continuity',bridgeUnvoiced:true,gapMs:800,jumpCents:0,cornerRadius:20,markers:'all'};
 const presets={soundglow:{...voiceDefaults,method:'filtered',speechGate:true,confirmationMs:50,gapMs:200},praat:{...defaults,voicingCeiling:800,maximum:800,axis:'log',drawing:'auto',edgeExtension:'half-frame',confidence:0,outlineWidth:3,lineWidth:1,smoothing:'off',gapMs:15,jumpCents:0,markers:'off',bands:false}};
 function presetName(state){return ({soundglow:'Soundglow',praat:'Praat',custom:'Unnamed Preset*'})[state.selected]||state.presets.find(p=>p.id===state.selected)?.name||'Unnamed Preset*'}
 function validName(name,list=[],except=''){
  if(typeof name!=='string')throw Error('Enter a preset name.');name=name.trim();if(!name||name.length>60||name.includes('*')||['soundglow','praat',...list.filter(p=>p.id!==except).map(p=>p.name.toLowerCase())].includes(name.toLowerCase()))throw Error('Choose a unique name without an asterisk.');return name;
 }
 function restore(text){try{
  const x=JSON.parse(text);if(x.version!==1)throw Error();const values=pitch(x.pitch),list=[];
  for(const p of x.presets||[]){if(typeof p.id!=='string'||!p.id.startsWith('saved-')||list.some(q=>q.id===p.id))continue;try{let name=p.name;if(typeof name==='string'&&['soundglow','praat'].includes(name.trim().toLowerCase())){const base=name.trim().slice(0,45);let n=1;do{name=base+' (custom'+(n>1?' '+n:'')+')';n++}while(list.some(q=>q.name.toLowerCase()===name.toLowerCase()))}list.push({id:p.id,name:validName(name,list),settings:pitch(p.settings)})}catch{}}
  if(x.selected==='voice')x.selected='soundglow';
  const selected=Object.hasOwn(presets,x.selected)||list.some(p=>p.id===x.selected)?x.selected:'custom';
  return {active:['pitch','spectrogram'].includes(x.active)?x.active:'spectrogram',pitch:selected==='custom'?values:pitch(presets[selected]||list.find(p=>p.id===selected).settings),selected:!x.selected&&JSON.stringify(values)===JSON.stringify(pitch())?'soundglow':selected,presets:list};
 }catch{return {active:'spectrogram',pitch:pitch(presets.soundglow),selected:'soundglow',presets:[]}}}
 function choose(state,id){const values=presets[id]||state.presets.find(p=>p.id===id)?.settings;if(!values)throw Error('Unknown pitch preset');return {...state,selected:id,pitch:pitch(values)}}
 function changed(state,values){const p=pitch(values);if(JSON.stringify(p)===JSON.stringify(state.pitch))return state;return {...state,pitch:p,selected:state.presets.some(q=>q.id===state.selected)?state.selected:'custom',presets:state.presets.map(q=>q.id===state.selected?{...q,settings:pitch(p)}:q)}}
 function save(state,name,id){name=validName(name,state.presets,state.selected);const existing=state.presets.find(p=>p.id===state.selected);if(!existing&&(!id||!id.startsWith('saved-')||state.presets.some(p=>p.id===id)))throw Error('Invalid preset identity');const item={id:existing?.id||id,name,settings:pitch(state.pitch)};return {...state,selected:item.id,presets:existing?state.presets.map(p=>p.id===item.id?item:p):[...state.presets,item]}}
 function remove(state){if(!state.presets.some(p=>p.id===state.selected))throw Error('Only named presets can be deleted');return choose({...state,presets:state.presets.filter(p=>p.id!==state.selected)},'soundglow')}
 function isVoiced(row,p){return Number.isFinite(row.pitch)&&row.pitch>=50&&row.pitch<p.voicingCeiling&&Number.isFinite(row.strength)&&row.strength>=p.confidence}
 // A small prefix summary preserves grouping decisions when raw history expires.
 // It includes a partial bucket, so pruning within a bucket cannot alter its value.
 function reduceGroups(rows,p,seed=null){
  const step=p.samplingMs/1000,out=[];let current=seed?{...seed}:null;
  const sample=c=>({time:(c.index+.5)*step,pitch:c.value,strength:c.value?1:0});
  for(const row of rows){
   const index=Math.floor((row.time+1e-8)/step);
   if(!current||index!==current.index){
    if(current)out.push(sample(current));
    current={index,count:0,total:0,value:0,previousIndex:current?.index??null,previousValue:current?.value??0,lastVoiced:current?.value?sample(current):current?.lastVoiced??null};
   }
   if(isVoiced(row,p)){
    current.total+=row.pitch;current.count++;
    if(p.aggregation==='continuity'&&current.previousIndex===index-1&&current.previousValue){
     if(current.count===1||Math.abs(row.pitch-current.previousValue)<Math.abs(current.value-current.previousValue))current.value=row.pitch;
    }else current.value=current.total/current.count;
   }
  }
  if(current)out.push(sample(current));return {rows:out,seed:current};
 }
 function group(rows,p,seed=null){return p.samplingMs?reduceGroups(rows,p,seed).rows:rows}
 function groupSeed(rows,p,seed=null){return p.samplingMs?reduceGroups(rows,p,seed).seed:null}
 function drawingPolicy(p,step,history,analysisFloor=50){const undersampled=step>.5*3/analysisFloor;return {curve:p.drawing==='curve'||p.drawing==='auto'&&!undersampled,dots:p.drawing==='dots'||p.drawing==='auto'&&(undersampled||Math.floor(history/step)<101)}}
 function position(hz,p){return p.axis==='log'?Math.log(hz/p.minimum)/Math.log(p.maximum/p.minimum):(hz-p.minimum)/(p.maximum-p.minimum)}
 // Extend each defined stretch by half a frame without crossing an unvoiced gap.
 function edges(points,step){const out=[];for(let i=0;i<points.length;i++){const p=points[i];if(!p.hz){out.push(p);continue}if(!p.connected)out.push({...p,time:p.time-step/2,connected:false,marker:false});out.push({...p,connected:true});if(!points[i+1]?.hz||!points[i+1]?.connected)out.push({...p,time:p.time+step/2,connected:true,marker:false})}return out}
 // Geometry for a polyline rounded by quadratic corner cuts in screen pixels.
 function path(points,radius=0){const commands=[];let segment=[];
  function flush(){if(!segment.length)return;commands.push(['moveTo',segment[0].x,segment[0].y]);for(let i=1;i<segment.length;i++){const a=segment[i-1],b=segment[i],length=Math.hypot(b.x-a.x,b.y-a.y),r=length?Math.min(.5,radius/length):0,dx=(b.x-a.x)*r,dy=(b.y-a.y)*r;if(radius){commands.push(['quadraticCurveTo',a.x,a.y,a.x+dx,a.y+dy]);if(r<.5)commands.push(['lineTo',b.x-dx,b.y-dy])}else commands.push(['lineTo',b.x,b.y])}if(radius)commands.push(['lineTo',segment.at(-1).x,segment.at(-1).y]);segment=[];}
  for(const p of points){if(!p.hz)continue;if(!p.connected)flush();segment.push(p)}flush();return commands;
 }
 // Apply the selected confidence, gap and jump policy before display smoothing.
 function points(rows,settings={},seed=null){
  const p=pitch(settings),{smoothing}=p;rows=group(rows,p,seed);
  let previous=seed&&(p.bridgeUnvoiced||seed.previousValue>0)?seed.lastVoiced:null,filtered=previous?.pitch??null;return rows.map(row=>{
   const voiced=isVoiced(row,p);
   if(!voiced){if(!p.bridgeUnvoiced){previous=null;filtered=null;}return {time:row.time,hz:0,connected:false}}
   const connected=!!previous&&row.time>previous.time&&row.time-previous.time<=p.gapMs/1000+1e-8&&(!p.jumpCents||Math.abs(Math.log2(row.pitch/previous.pitch))*1200<p.jumpCents);
   const alpha=connected&&smoothing==='light'?1-Math.exp(-(row.time-previous.time)/.025):1;
   filtered=connected?filtered+alpha*(row.pitch-filtered):row.pitch;previous=row;
   return {time:row.time,hz:filtered,connected,marker:p.markers==='all'||p.markers==='spaced'&&Math.round(row.time*100)%4===0};
  });
 }
 const api={legacyVoice:voiceDefaults,defaults,pitch,restore,points,path,presets,presetName,choose,changed,save,remove,validName,group,groupSeed,drawingPolicy,position,edges};if(typeof module==='object'&&module.exports)module.exports=api;else scope.FeatureState=api;
})(typeof self==='object'?self:globalThis);
