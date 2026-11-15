// SPDX-License-Identifier: GPL-3.0-or-later
// Feature controller: transport is shared; feature state and rendering are scoped.
(function(){
 const pitchUI=window.SoundglowShell.pitch,presetUI=window.SoundglowShell.pitchPresets;
 const $=id=>document.getElementById(id),host=window.soundglowSession,key='soundglow-workspace-v1';
 let saved;try{saved=localStorage.getItem(key)}catch{}
 let state=FeatureState.restore(saved),pitchStream=null,cursor=null,pumping=false,epoch=0,rows=[],rawRows=[],contour=null,contourKey='',speechFrames=[],neuralEvidence=new NeuralEvidence(),speechSession=crypto.randomUUID(),lastPaint='',lastLayout='',paintQueued=false;
 let lastModelStatus=null;
 let grouping={key:null,settings:null,seed:null};
 // Experimental speech confirmation failed the quiet-speech acceptance limit.
 // Keep it opt-in until a matched streaming trial passes.
 const experimentalSpeechGate=new URLSearchParams(location.search).get('experimentalSpeechGate')==='1';
 const chart=$('pitchCanvas'),g=chart.getContext('2d');
 function persist(candidate=state){try{localStorage.setItem(key,JSON.stringify({version:1,...candidate}));return true}catch{presetUI.status('Could not save pitch settings in this browser. Allow local storage and try again.');return false}}
 function reset(){epoch++;pitchStream?.dispose();pitchStream=null;cursor=null;rows=[];rawRows=[];contour=null;contourKey='';speechFrames=[];neuralEvidence=new NeuralEvidence();speechSession=crypto.randomUUID();grouping={key:null,settings:null,seed:null};lastPaint=''}
 function trimPitch(){if(host.fileView?.())return;
  const latest=rawRows.at(-1)?.time||0;
  while(rawRows.length&&rawRows[0].time<latest-32)rawRows.shift();
  const discarded=[];while(rows.length&&rows[0].time<latest-31)discarded.push(rows.shift());
  if(discarded.length&&grouping.settings?.samplingMs)grouping.seed=FeatureState.groupSeed(discarded,grouping.settings,grouping.seed);
 }
 function updateContour(incoming=[]){
  const p=state.pitch,key=JSON.stringify([p.speechGate,p.confirmationMs,p.confidence,p.voicingCeiling,p.breakUnconfirmedJumps]);
  if(key!==contourKey){contourKey=key;contour=new PitchContour({speechGate:p.speechGate,confirmationMs:p.confirmationMs,confidence:p.confidence,ceiling:p.voicingCeiling,breakUnconfirmedJumps:p.breakUnconfirmedJumps});rows=contour.push(rawRows);grouping={key:null,settings:null,seed:null};trimPitch();}
  else rows.push(...contour.push(incoming));
 }
 function withSpeech(row){return {...row,speech:neuralEvidence.allows(row.time)&&speechFrames.some(f=>f.time>=row.time-.1&&f.time<=row.time+.03&&f.speech)}}
 function syncPitch(){
  if(host.fileView?.())return;
  if((state.active!=='pitch'&&!pitchStream)||!host.state().running)return;
  if(!pitchStream){
   pitchStream=new PraatStream({sampleRate:host.state().sampleRate,retain:true,
    client:{analyse:(r,o)=>host.analyse(r,o),dispose(){}},
    settings:()=>({windowSeconds:.025,timeStep:.005,maximumFrequency:1000,frequencyStep:20,analysisFlags:6,pitchFloor:50,pitchCeiling:1200,pitchMethod:state.pitch.method}),
    onFrames:(_,result)=>{host.measure('pitchAnalysisMs',result.timings.analysisMs);host.measure('pitchWorkerRoundTripMs',result.timings.workerRoundTripMs);const features=result.features.map(withSpeech);rawRows.push(...features);updateContour(features);trimPitch();if(host.state().paused&&!paintQueued){paintQueued=true;requestAnimationFrame(()=>{paintQueued=false;paint()})}},
    onReconfigured:groups=>{rawRows=groups.flatMap(({result})=>result.features.map(withSpeech));rows=[];contourKey='';contour=null;grouping={key:null,settings:null,seed:null};pitchStream.requestedMethod=null;lastPaint='';paint()},
    onReconfigureError:error=>{const method=pitchStream?.activeSettings.pitchMethod;if(method)state=FeatureState.changed(state,{...state.pitch,method});if(pitchStream)pitchStream.requestedMethod=null;persist();controls(true);window.SoundglowDiagnostics?.capture(error,'pitch.analysis_failed');pitchUI.setError(error.message)},
    onError:error=>{window.SoundglowDiagnostics?.capture(error,'pitch.analysis_failed');pitchUI.setError(error.message)},
   });
   const raw=host.raw(),end=raw.at(-1);cursor=end?Math.max(raw[0].start,end.start-31):null;
  }
  if(pumping)return;pumping=true;const generation=epoch,stream=pitchStream;
  (async()=>{
   try{while(generation===epoch){
    const block=host.raw().find(b=>cursor===null||b.start+b.pcm.length/host.state().sampleRate>cursor+1e-7);if(!block)break;
    const rate=host.state().sampleRate,offset=cursor===null?0:Math.max(0,Math.round((cursor-block.start)*rate));
    const speech=await host.analyse({type:'speech',session:speechSession,neural:state.pitch.speechGate&&experimentalSpeechGate,pcm:block.pcm.slice(offset),start:block.start+offset/rate,sampleRate:rate},{transfer:true});if(generation!==epoch)return;host.measure('speechDetectionMs',speech.ms);chart.dataset.neuralStatus=speech.neuralStatus;chart.dataset.neuralError=speech.neuralError||'';if(experimentalSpeechGate&&state.pitch.speechGate&&speech.neuralStatus!==lastModelStatus){lastModelStatus=speech.neuralStatus;if(['loading','ready','unavailable'].includes(lastModelStatus))window.SoundglowDiagnostics?.offline('model',lastModelStatus==='loading'?'started':lastModelStatus==='ready'?'ready':'unavailable',{cacheReason:lastModelStatus==='unavailable'?'unavailable':'none'});}neuralEvidence.record(speech,block.start+offset/rate);speechFrames.push(...speech.decisions);while(speechFrames.length&&speechFrames[0].time<block.start-33)speechFrames.shift();await stream.push(block.pcm.slice(offset),block.start+offset/rate);if(generation!==epoch)return;cursor=block.start+block.pcm.length/rate;
   }}catch(error){if(generation===epoch){window.SoundglowDiagnostics?.capture(error,'pitch.analysis_failed');pitchUI.setError(error.message)}}
   finally{if(generation===epoch)pumping=false;}
  })();
 }
 function paint(){
  if(state.active!=='pitch')return;
  if(pitchStream&&(pitchStream.requestedMethod||pitchStream.activeSettings.pitchMethod)!==state.pitch.method){pitchStream.requestedMethod=state.pitch.method;void pitchStream.reconfigure({...pitchStream.activeSettings,pitchMethod:state.pitch.method});}
  updateContour();
  const box=$('plot').getBoundingClientRect(),ratio=window.devicePixelRatio||1,w=Math.max(1,Math.round(box.width)),h=Math.max(1,Math.round(box.height));
  const file=host.fileView?.(),duration=file?file.end-file.start:state.pitch.history,end=file?file.end:Math.max(0,(host.state().displayedUntil||0)-state.pitch.confirmationMs/1000),signature=[end,duration,file?.selection?.start,file?.selection?.end,host.state().time,file?fileLibrary.position:0,w,h,ratio,rows.length,JSON.stringify(state.pitch)].join(':');if(signature===lastPaint)return;lastPaint=signature;
  if(chart.width!==Math.round(w*ratio)||chart.height!==Math.round(h*ratio)){chart.width=Math.round(w*ratio);chart.height=Math.round(h*ratio)}
  g.setTransform(ratio,0,0,ratio,0,0);g.fillStyle='#090f19';g.fillRect(0,0,w,h);
  const p=state.pitch,left=48,right=w-15,top=34,bottom=h-28,width=Math.max(1,right-left),height=Math.max(1,bottom-top),begin=end-duration;
  const y=hz=>bottom-FeatureState.position(hz,p)*height,x=t=>left+(t-begin)/duration*width;
  g.save();g.beginPath();g.rect(left,top,width,height);g.clip();
  if(p.bands)for(const band of (p.bandMode==='target'?[{low:p.targetLow,high:p.targetHigh,colour:'#f58caa'}]:p.ranges)){g.fillStyle=band.colour+'52';g.fillRect(left,y(band.high),width,y(band.low)-y(band.high));}
  g.restore();g.font='11px system-ui';g.lineWidth=1;g.textBaseline='middle';
  const step=p.maximum-p.minimum>700?100:50;
  const ticks=p.axis==='log'?[...new Set([p.minimum,50,100,200,500,1000,p.maximum])].filter(hz=>hz>=p.minimum&&hz<=p.maximum).sort((a,b)=>a-b):Array.from({length:Math.floor(p.maximum/step)-Math.ceil(p.minimum/step)+1},(_,i)=>(Math.ceil(p.minimum/step)+i)*step);
  for(const hz of ticks){const yy=y(hz);g.strokeStyle='#a7bbd34d';g.beginPath();g.moveTo(left,yy);g.lineTo(right,yy);g.stroke();g.fillStyle='#b8c8da';g.textAlign='right';g.fillText(String(hz),left-8,yy)}
  g.textAlign='left';g.fillStyle='#b8c8da';g.fillText('Hz',10,15);
  const frameStep=p.samplingMs?p.samplingMs/1000:.01,policy=FeatureState.drawingPolicy(p,frameStep,duration);
  const groupingKey=JSON.stringify([p.samplingMs,p.aggregation,p.voicingCeiling,p.confidence]);
  if(grouping.key!==groupingKey)grouping={key:groupingKey,settings:p,seed:null};
  // Grouped measurements belong at their bucket centre. Complete the bucket
  // using already analysed context before showing it; never flash partial groups.
  const lookahead=p.samplingMs/2000,available=rows.at(-1)?.time??-Infinity;
  const points=FeatureState.completedPoints(FeatureState.points(rows.filter(r=>r.time<=end+lookahead+(p.edgeExtension==='half-frame'?frameStep:0)),p,grouping.seed),p,end,available).filter(r=>r.time>=begin-(p.edgeExtension==='half-frame'?frameStep:0));
  const curvePoints=p.edgeExtension==='half-frame'?FeatureState.edges(points,frameStep):points;
  g.save();g.beginPath();g.rect(left,top,width,height);g.clip();g.strokeStyle='#ff9a70';g.lineWidth=p.lineWidth;g.lineJoin='round';g.lineCap='round';g.beginPath();
  for(const [command,...args] of FeatureState.path(curvePoints.map(point=>({...point,x:x(point.time),y:y(point.hz)})),p.cornerRadius))g[command](...args);
  if(policy.curve){if(p.outlineWidth){g.strokeStyle='#8cdcff';g.lineWidth=p.outlineWidth;g.stroke()}g.strokeStyle='#ff9a70';g.lineWidth=p.lineWidth;g.stroke();}
  g.fillStyle='#e0efff';for(const point of points){if(point.hz&&point.time>=begin&&point.time<=end&&(policy.dots||p.drawing==='curve'&&point.marker)){g.beginPath();g.arc(x(point.time),y(point.hz),p.markerRadius,0,2*Math.PI);g.fill()}}g.restore();
  g.font='10px system-ui';g.fillStyle='#b8c8da';g.textAlign='center';
  for(let i=0;i<=4;i++)g.fillText(file?fileTimeLabel(file.start+duration*i/4):i===4?'now':'−'+ +(p.history*(1-i/4)).toFixed(1)+'s',left+width*i/4,h-11);
  if(file){g.save();g.beginPath();g.rect(left,top,width,height);g.clip();host.drawFileMarkers(g,left,top,width,height);g.restore();}
  chart.dataset.fileStart=file?file.start:'';chart.dataset.fileEnd=file?file.end:'';
  chart.dataset.pitchMethod=pitchStream?.activeSettings.pitchMethod||state.pitch.method;chart.dataset.plottedUntil=String(end);chart.dataset.voiced=String(points.filter(r=>r.hz>0&&r.time>=begin&&r.time<=end).length);
 }
 function controls(force=false,resetDrafts=force){settingsController.publish(resetDrafts)}
 host.viewLabel=()=>state.active==='pitch'?FeatureState.presetName(state):null;host.featureState=()=>({active:state.active,pitch:FeatureState.pitch(state.pitch)});
 function layout(){
  const signature=[state.active,$('settings').getAttribute('aria-expanded'),window.matchMedia('(min-width: 761px)').matches].join(':');if(signature===lastLayout)return;lastLayout=signature;
  window.SoundglowShell.setFeature(state.active);
  const pitch=state.active==='pitch';document.getElementById('app').classList.toggle('pitch-active',pitch);chart.hidden=!pitch;$('spectrogramSettings').hidden=pitch;$('pitchSettings').hidden=!pitch;
  $('plot').setAttribute('aria-labelledby',pitch?'pitchTab':'spectrogramTab');
  $('plot').setAttribute('aria-label',pitch?'Live pitch: frequency vertically, time horizontally':'Live spectrogram: frequency vertically, time horizontally');
  if(pitch)window.SoundglowShell.feedback.publish({resolution:FeatureState.presetName(state)});
 }
 const scrollPositions={spectrogram:0,pitch:0};
 function select(feature){if(feature===state.active)return;scrollPositions[state.active]=$('settingsBody').scrollTop;state.active=feature;persist();lastPaint='';layout();$('settingsBody').scrollTop=scrollPositions[feature];if(feature==='spectrogram')updateResolution();syncPitch();paint()}
 window.SoundglowShell.configure({layout:syncSettings,select});
 const settingsController=window.SoundglowControllers.connectPitchSettings({
  ui:pitchUI,presets:presetUI,model:FeatureState,getState:()=>state,setState:next=>{state=next},persist,
  refreshFile:()=>host.refreshFileView?.(),repaint:()=>{lastPaint='';paint()},resolution:updateResolution
 });
 host.subscribe(type=>{if(type==='fileview'){reset();pumping=false;const file=host.fileView?.();if(file){rawRows=file.features;updateContour();lastPaint='';paint();}else{lastPaint='';paint();}return;}if(type==='stop'||type==='seek'){reset();pumping=false;}if(type==='capture'||type==='seek')syncPitch();if(type==='render'||type==='layout'){layout();paint()}});
 controls();layout();
})();

window.dispatchEvent(new Event('soundtools:ready'));
