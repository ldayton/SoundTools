// SPDX-License-Identifier: GPL-3.0-or-later
// Feature controller: transport is shared; feature state and rendering are scoped.
(function(){
 const $=id=>document.getElementById(id),host=window.soundglowSession,key='soundglow-workspace-v1';
 let saved;try{saved=localStorage.getItem(key)}catch{}
 let state=FeatureState.restore(saved),pitchStream=null,cursor=null,pumping=false,epoch=0,rows=[],rawRows=[],contour=null,contourKey='',speechFrames=[],neuralEvidence=new NeuralEvidence(),speechSession=crypto.randomUUID(),lastPaint='',lastLayout='',paintQueued=false;
 let grouping={key:null,settings:null,seed:null};
 // Experimental speech confirmation failed the quiet-speech acceptance limit.
 // Keep it opt-in until a matched streaming trial passes.
 const experimentalSpeechGate=new URLSearchParams(location.search).get('experimentalSpeechGate')==='1';
 const chart=$('pitchCanvas'),g=chart.getContext('2d');
 function persist(){try{localStorage.setItem(key,JSON.stringify({version:1,...state}))}catch{}}
 function reset(){epoch++;pitchStream?.dispose();pitchStream=null;cursor=null;rows=[];rawRows=[];contour=null;contourKey='';speechFrames=[];neuralEvidence=new NeuralEvidence();speechSession=crypto.randomUUID();grouping={key:null,settings:null,seed:null};lastPaint=''}
 function trimPitch(){
  const latest=rawRows.at(-1)?.time||0;
  while(rawRows.length&&rawRows[0].time<latest-32)rawRows.shift();
  const discarded=[];while(rows.length&&rows[0].time<latest-31)discarded.push(rows.shift());
  if(discarded.length&&grouping.settings?.samplingMs)grouping.seed=FeatureState.groupSeed(discarded,grouping.settings,grouping.seed);
 }
 function updateContour(incoming=[]){
  const p=state.pitch,key=JSON.stringify([p.speechGate,p.confirmationMs,p.confidence,p.voicingCeiling]);
  if(key!==contourKey){contourKey=key;contour=new PitchContour({speechGate:p.speechGate,confirmationMs:p.confirmationMs,confidence:p.confidence,ceiling:p.voicingCeiling});rows=contour.push(rawRows);grouping={key:null,settings:null,seed:null};trimPitch();}
  else rows.push(...contour.push(incoming));
 }
 function withSpeech(row){return {...row,speech:neuralEvidence.allows(row.time)&&speechFrames.some(f=>f.time>=row.time-.1&&f.time<=row.time+.03&&f.speech)}}
 function syncPitch(){
  if((state.active!=='pitch'&&!pitchStream)||!host.state().running)return;
  if(!pitchStream){
   pitchStream=new PraatStream({sampleRate:host.state().sampleRate,retain:true,
    client:{analyse:(r,o)=>host.analyse(r,o),dispose(){}},
    settings:()=>({windowSeconds:.025,timeStep:.005,maximumFrequency:1000,frequencyStep:20,analysisFlags:6,pitchFloor:50,pitchCeiling:1200,pitchMethod:state.pitch.method}),
    onFrames:(_,result)=>{host.measure('pitchAnalysisMs',result.timings.analysisMs);host.measure('pitchWorkerRoundTripMs',result.timings.workerRoundTripMs);const features=result.features.map(withSpeech);rawRows.push(...features);updateContour(features);trimPitch();if(host.state().paused&&!paintQueued){paintQueued=true;requestAnimationFrame(()=>{paintQueued=false;paint()})}},
    onReconfigured:groups=>{rawRows=groups.flatMap(({result})=>result.features.map(withSpeech));rows=[];contourKey='';contour=null;grouping={key:null,settings:null,seed:null};pitchStream.requestedMethod=null;lastPaint='';paint()},
    onReconfigureError:error=>{const method=pitchStream?.activeSettings.pitchMethod;if(method)state=FeatureState.changed(state,{...state.pitch,method});if(pitchStream)pitchStream.requestedMethod=null;persist();controls(true);$('pitchError').textContent=error.message;$('pitchError').hidden=false},
    onError:error=>{$('pitchError').textContent=error.message;$('pitchError').hidden=false},
   });
   const raw=host.raw(),end=raw.at(-1);cursor=end?Math.max(raw[0].start,end.start-31):null;
  }
  if(pumping)return;pumping=true;const generation=epoch,stream=pitchStream;
  (async()=>{
   try{while(generation===epoch){
    const block=host.raw().find(b=>cursor===null||b.start+b.pcm.length/host.state().sampleRate>cursor+1e-7);if(!block)break;
    const rate=host.state().sampleRate,offset=cursor===null?0:Math.max(0,Math.round((cursor-block.start)*rate));
    const speech=await host.analyse({type:'speech',session:speechSession,neural:state.pitch.speechGate&&experimentalSpeechGate,pcm:block.pcm.slice(offset),start:block.start+offset/rate,sampleRate:rate},{transfer:true});if(generation!==epoch)return;host.measure('speechDetectionMs',speech.ms);chart.dataset.neuralStatus=speech.neuralStatus;chart.dataset.neuralError=speech.neuralError||'';neuralEvidence.record(speech,block.start+offset/rate);speechFrames.push(...speech.decisions);while(speechFrames.length&&speechFrames[0].time<block.start-33)speechFrames.shift();await stream.push(block.pcm.slice(offset),block.start+offset/rate);if(generation!==epoch)return;cursor=block.start+block.pcm.length/rate;
   }}catch(error){if(generation===epoch){$('pitchError').textContent=error.message;$('pitchError').hidden=false}}
   finally{if(generation===epoch)pumping=false;}
  })();
 }
 function paint(){
  if(state.active!=='pitch')return;
  if(pitchStream&&(pitchStream.requestedMethod||pitchStream.activeSettings.pitchMethod)!==state.pitch.method){pitchStream.requestedMethod=state.pitch.method;void pitchStream.reconfigure({...pitchStream.activeSettings,pitchMethod:state.pitch.method});}
  updateContour();
  const box=$('plot').getBoundingClientRect(),ratio=window.devicePixelRatio||1,w=Math.max(1,Math.round(box.width)),h=Math.max(1,Math.round(box.height));
  const end=Math.max(0,(host.state().displayedUntil||0)-state.pitch.confirmationMs/1000),signature=[end,w,h,ratio,rows.length,JSON.stringify(state.pitch)].join(':');if(signature===lastPaint)return;lastPaint=signature;
  if(chart.width!==Math.round(w*ratio)||chart.height!==Math.round(h*ratio)){chart.width=Math.round(w*ratio);chart.height=Math.round(h*ratio)}
  g.setTransform(ratio,0,0,ratio,0,0);g.fillStyle='#090f19';g.fillRect(0,0,w,h);
  const p=state.pitch,left=48,right=w-15,top=34,bottom=h-28,width=Math.max(1,right-left),height=Math.max(1,bottom-top),begin=end-p.history;
  const y=hz=>bottom-FeatureState.position(hz,p)*height,x=t=>left+(t-begin)/p.history*width;
  g.save();g.beginPath();g.rect(left,top,width,height);g.clip();
  if(p.bands)for(const band of p.ranges){g.fillStyle=band.colour+'52';g.fillRect(left,y(band.high),width,y(band.low)-y(band.high));}
  g.restore();g.font='11px system-ui';g.lineWidth=1;g.textBaseline='middle';
  const step=p.maximum-p.minimum>700?100:50;
  const ticks=p.axis==='log'?[...new Set([p.minimum,50,100,200,500,1000,p.maximum])].filter(hz=>hz>=p.minimum&&hz<=p.maximum).sort((a,b)=>a-b):Array.from({length:Math.floor(p.maximum/step)-Math.ceil(p.minimum/step)+1},(_,i)=>(Math.ceil(p.minimum/step)+i)*step);
  for(const hz of ticks){const yy=y(hz);g.strokeStyle='#a7bbd34d';g.beginPath();g.moveTo(left,yy);g.lineTo(right,yy);g.stroke();g.fillStyle='#b8c8da';g.textAlign='right';g.fillText(String(hz),left-8,yy)}
  g.textAlign='left';g.fillStyle='#b8c8da';g.fillText('Hz',10,15);
  const frameStep=p.samplingMs?p.samplingMs/1000:.01,policy=FeatureState.drawingPolicy(p,frameStep,p.history);
  const groupingKey=JSON.stringify([p.samplingMs,p.aggregation,p.voicingCeiling,p.confidence]);
  if(grouping.key!==groupingKey)grouping={key:groupingKey,settings:p,seed:null};
  // Grouped measurements belong at their bucket centre. Complete the bucket
  // using already analysed context before showing it; never flash partial groups.
  const lookahead=p.samplingMs/2000,available=rows.at(-1)?.time??-Infinity;
  const points=FeatureState.points(rows.filter(r=>r.time<=end+lookahead+(p.edgeExtension==='half-frame'?frameStep:0)),p,grouping.seed).filter(r=>r.time>=begin-(p.edgeExtension==='half-frame'?frameStep:0)&&(!p.samplingMs||r.time<=end&&r.time+lookahead<=available+1e-8));
  const curvePoints=p.edgeExtension==='half-frame'?FeatureState.edges(points,frameStep):points;
  g.save();g.beginPath();g.rect(left,top,width,height);g.clip();g.strokeStyle='#ff9a70';g.lineWidth=p.lineWidth;g.lineJoin='round';g.lineCap='round';g.beginPath();
  for(const [command,...args] of FeatureState.path(curvePoints.map(point=>({...point,x:x(point.time),y:y(point.hz)})),p.cornerRadius/ratio))g[command](...args);
  if(policy.curve){if(p.outlineWidth){g.strokeStyle='#8cdcff';g.lineWidth=p.outlineWidth;g.stroke()}g.strokeStyle='#ff9a70';g.lineWidth=p.lineWidth;g.stroke();}
  g.fillStyle='#e0efff';for(const point of points){if(point.hz&&point.time>=begin&&point.time<=end&&(policy.dots||p.drawing==='curve'&&point.marker)){g.beginPath();g.arc(x(point.time),y(point.hz),p.markerRadius,0,2*Math.PI);g.fill()}}g.restore();
  g.font='10px system-ui';g.fillStyle='#b8c8da';g.textAlign='center';
  for(let i=0;i<=4;i++)g.fillText(i===4?'now':'−'+ +(p.history*(1-i/4)).toFixed(1)+'s',left+width*i/4,h-11);
  chart.dataset.pitchMethod=pitchStream?.activeSettings.pitchMethod||state.pitch.method;chart.dataset.plottedUntil=String(end);chart.dataset.voiced=String(points.filter(r=>r.hz>0&&r.time>=begin&&r.time<=end).length);
 }
 function controls(force=false){
  const p=state.pitch;for(const [id,value]of [['pitchMethod',p.method],['pitchConfirmation',p.confirmationMs],['pitchMinimum',p.minimum],['pitchMaximum',p.maximum],['pitchHistory',p.history],['pitchSmoothing',p.smoothing],['pitchSampling',p.samplingMs],['pitchAggregation',p.aggregation],['pitchGap',p.gapMs],['pitchJumps',p.jumpCents],['pitchCorners',p.cornerRadius],['pitchMarkers',p.markers],['pitchLineWidth',p.lineWidth],['pitchMarkerRadius',p.markerRadius],['pitchAxis',p.axis],['pitchDrawing',p.drawing],['pitchEdges',p.edgeExtension],['pitchConfidence',p.confidence],['pitchOutline',p.outlineWidth],['pitchVoicingCeiling',p.voicingCeiling]])if(force||document.activeElement!==$(id))$(id).value=value;
  $('pitchSpeechGate').checked=p.speechGate;$('pitchMarkers').disabled=p.drawing!=='curve';$('pitchBridge').checked=p.bridgeUnvoiced;presetControls();$('pitchBands').checked=p.bands;
  if(!$('pitchRanges').children.length)p.ranges.forEach((band,i)=>{
   const group=document.createElement('div');group.className='pitchRange';
   const title=document.createElement('h5');title.textContent='Band '+(i+1);group.append(title);
   const limits=document.createElement('div');limits.className='limits';
   for(const field of ['low','high']){const label=document.createElement('label');label.textContent=field==='low'?'From (Hz)':'To (Hz)';const input=document.createElement('input');input.type='number';input.dataset.band=i;input.dataset.field=field;input.min=50;input.max=1200;input.value=band[field];input.setAttribute('aria-label','Band '+(i+1)+' '+field+' Hz');input.onchange=()=>edit(p=>{p.ranges[i][field]=Number(input.value)});label.append(input);limits.append(label)}
   group.append(limits);$('pitchRanges').append(group);
  });
  for(const input of $('pitchRanges').querySelectorAll('input[data-band]'))if(force||document.activeElement!==input)input.value=p.ranges[Number(input.dataset.band)][input.dataset.field];
 }
 function edit(change){const next=FeatureState.pitch(state.pitch);change(next);let invalid=false;try{state=FeatureState.changed(state,next);$('pitchError').hidden=true;persist();lastPaint='';paint()}catch(error){invalid=true;$('pitchError').textContent=error.message;$('pitchError').hidden=false;}controls(invalid)}
 host.viewLabel=()=>state.active==='pitch'?FeatureState.presetName(state):null;host.featureState=()=>({active:state.active,pitch:FeatureState.pitch(state.pitch)});
 function layout(){
  const signature=[state.active,$('settings').getAttribute('aria-expanded'),window.matchMedia('(min-width: 761px)').matches].join(':');if(signature===lastLayout)return;lastLayout=signature;
  const desktop=window.matchMedia('(min-width: 761px)').matches,nav=$('featureTabs'),toolbar=$('workspaceToolbar');
  if(nav.parentElement!==$('app')||nav.previousElementSibling!==toolbar)$('app').insertBefore(nav,toolbar.nextSibling);
  const pitch=state.active==='pitch';document.getElementById('app').classList.toggle('pitch-active',pitch);chart.hidden=!pitch;$('spectrogramSettings').hidden=pitch;$('pitchSettings').hidden=!pitch;
  $('spectrogramTab').setAttribute('aria-selected',String(!pitch));$('pitchTab').setAttribute('aria-selected',String(pitch));$('spectrogramTab').tabIndex=pitch?-1:0;$('pitchTab').tabIndex=pitch?0:-1;
  $('plot').setAttribute('aria-labelledby',pitch?'pitchTab':'spectrogramTab');
  $('plot').setAttribute('aria-label',pitch?'Live pitch: frequency vertically, time horizontally':'Live spectrogram: frequency vertically, time horizontally');
  $('workspaceToolbar').setAttribute('aria-label','Audio controls');
  if(pitch)$('resolution').textContent=FeatureState.presetName(state);
  if($('settings').getAttribute('aria-expanded')==='true'){const label=desktop?'Close settings':'Return to '+state.active;$('settings').setAttribute('aria-label',label);$('settings').title=label;}
 }
 const scrollPositions={spectrogram:0,pitch:0};
 function select(feature){if(feature===state.active)return;scrollPositions[state.active]=$('settingsBody').scrollTop;state.active=feature;persist();lastPaint='';layout();$('settingsBody').scrollTop=scrollPositions[feature];if(feature==='spectrogram')updateResolution();syncPitch();paint()}
 $('featureTabs').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const feature=event.key==='Home'?'spectrogram':event.key==='End'?'pitch':state.active==='pitch'?'spectrogram':'pitch';select(feature);$(feature+'Tab').focus()}});
 $('spectrogramTab').onclick=()=>select('spectrogram');$('pitchTab').onclick=()=>select('pitch');
 for(const [id,field]of [['pitchMinimum','minimum'],['pitchMaximum','maximum'],['pitchHistory','history']])$(id).onchange=()=>edit(p=>{p[field]=Number($(id).value)});
 $('pitchSmoothing').onchange=()=>edit(p=>{p.smoothing=$('pitchSmoothing').value});$('pitchBands').onchange=()=>edit(p=>{p.bands=$('pitchBands').checked});$('resetPitch').onclick=()=>{state=FeatureState.choose(state,'soundglow');$('pitchError').hidden=true;persist();controls(true);lastPaint='';paint()};
 function presetControls(){
  const select=$('pitchPreset'),entries=[['soundglow','Soundglow'],['praat','Praat'],...state.presets.map(p=>[p.id,p.name])];if(state.selected==='custom')entries.push(['custom','Unnamed Preset*']);
  const signature=JSON.stringify(entries);if(select.dataset.entries!==signature){select.replaceChildren(...entries.map(([id,name])=>new Option(name,id)));select.dataset.entries=signature}select.value=state.selected;updateResolution();
 }
 function applyPitch(id){state=FeatureState.choose(state,id);$('pitchError').hidden=true;persist();controls(true);lastPaint='';paint();}
 $('pitchPreset').onchange=()=>{if($('pitchPreset').value!=='custom')applyPitch($('pitchPreset').value)};
 for(const [id,key,numeric] of [['pitchMethod','method'],['pitchConfirmation','confirmationMs',true],['pitchSampling','samplingMs',true],['pitchAggregation','aggregation'],['pitchGap','gapMs',true],['pitchJumps','jumpCents',true],['pitchCorners','cornerRadius',true],['pitchMarkers','markers'],['pitchLineWidth','lineWidth',true],['pitchMarkerRadius','markerRadius',true],['pitchAxis','axis'],['pitchDrawing','drawing'],['pitchEdges','edgeExtension'],['pitchConfidence','confidence',true],['pitchOutline','outlineWidth',true],['pitchVoicingCeiling','voicingCeiling',true]])$(id).onchange=()=>edit(p=>{p[key]=numeric?Number($(id).value):$(id).value});
 $('pitchSpeechGate').onchange=()=>edit(p=>{p.speechGate=$('pitchSpeechGate').checked});
 $('pitchBridge').onchange=()=>edit(p=>{p.bridgeUnvoiced=$('pitchBridge').checked});
 $('editPitchPreset').onclick=()=>{const saved=state.presets.find(p=>p.id===state.selected);$('pitchPresetName').value=saved?.name||'';$('deletePitchPreset').hidden=!saved;$('pitchPresetStatus').textContent='';$('pitchPresetDialog').showModal();$('pitchPresetName').focus()};
 $('cancelPitchPreset').onclick=()=>$('pitchPresetDialog').close();
 $('pitchPresetForm').onsubmit=event=>{event.preventDefault();try{state=FeatureState.save(state,$('pitchPresetName').value,'saved-'+crypto.randomUUID());persist();presetControls();$('pitchPresetDialog').close()}catch(error){$('pitchPresetStatus').textContent=error.message}};
 $('deletePitchPreset').onclick=()=>{state=FeatureState.remove(state);$('pitchError').hidden=true;persist();controls(true);lastPaint='';paint();$('pitchPresetDialog').close()};
 host.subscribe(type=>{if(type==='stop'||type==='seek'){reset();pumping=false;}if(type==='capture'||type==='seek')syncPitch();if(type==='render'||type==='layout'){layout();paint()}});
 controls();layout();
})();
