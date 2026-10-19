// SPDX-License-Identifier: GPL-3.0-or-later
// Feature controller: transport is shared; feature state and rendering are scoped.
(function(){
 const $=id=>document.getElementById(id),host=window.soundglowSession,key='soundglow-workspace-v1';
 let saved;try{saved=localStorage.getItem(key)}catch{}
 let state=FeatureState.restore(saved),pitchStream=null,cursor=null,pumping=false,epoch=0,rows=[],lastPaint='',lastLayout='',paintQueued=false;
 const chart=$('pitchCanvas'),g=chart.getContext('2d');
 function persist(){try{localStorage.setItem(key,JSON.stringify({version:1,...state}))}catch{}}
 function reset(){epoch++;pitchStream?.dispose();pitchStream=null;cursor=null;rows=[];lastPaint=''}
 function syncPitch(){
  if((state.active!=='pitch'&&!pitchStream)||!host.state().running)return;
  if(!pitchStream){
   pitchStream=new PraatStream({sampleRate:host.state().sampleRate,retain:false,
    client:{analyse:(r,o)=>host.analyse(r,o),dispose(){}},
    settings:()=>({windowSeconds:.025,timeStep:.005,maximumFrequency:1000,frequencyStep:20,analysisFlags:6,pitchFloor:50,pitchCeiling:1200}),
    onFrames:(_,result)=>{host.measure('pitchAnalysisMs',result.timings.analysisMs);host.measure('pitchWorkerRoundTripMs',result.timings.workerRoundTripMs);rows.push(...result.features);const cutoff=(rows.at(-1)?.time||0)-31;while(rows.length&&rows[0].time<cutoff)rows.shift();if(host.state().paused&&!paintQueued){paintQueued=true;requestAnimationFrame(()=>{paintQueued=false;paint()})}},
    onError:error=>{$('pitchError').textContent=error.message;$('pitchError').hidden=false},
   });
   const raw=host.raw(),end=raw.at(-1);cursor=end?Math.max(raw[0].start,end.start-31):null;
  }
  if(pumping)return;pumping=true;const generation=epoch,stream=pitchStream;
  (async()=>{
   try{while(generation===epoch){
    const block=host.raw().find(b=>cursor===null||b.start+b.pcm.length/host.state().sampleRate>cursor+1e-7);if(!block)break;
    const rate=host.state().sampleRate,offset=cursor===null?0:Math.max(0,Math.round((cursor-block.start)*rate));
    await stream.push(block.pcm.slice(offset),block.start+offset/rate);if(generation!==epoch)return;cursor=block.start+block.pcm.length/rate;
   }}catch(error){if(generation===epoch){$('pitchError').textContent=error.message;$('pitchError').hidden=false}}
   finally{if(generation===epoch)pumping=false;}
  })();
 }
 function paint(){
  if(state.active!=='pitch')return;
  const box=$('plot').getBoundingClientRect(),ratio=window.devicePixelRatio||1,w=Math.max(1,Math.round(box.width)),h=Math.max(1,Math.round(box.height));
  const end=host.state().displayedUntil||0,signature=[end,w,h,ratio,rows.length,JSON.stringify(state.pitch)].join(':');if(signature===lastPaint)return;lastPaint=signature;
  if(chart.width!==Math.round(w*ratio)||chart.height!==Math.round(h*ratio)){chart.width=Math.round(w*ratio);chart.height=Math.round(h*ratio)}
  g.setTransform(ratio,0,0,ratio,0,0);g.fillStyle='#090f19';g.fillRect(0,0,w,h);
  const p=state.pitch,left=48,right=w-15,top=34,bottom=h-28,width=Math.max(1,right-left),height=Math.max(1,bottom-top),begin=end-p.history;
  const y=hz=>bottom-(hz-p.minimum)/(p.maximum-p.minimum)*height,x=t=>left+(t-begin)/p.history*width;
  g.save();g.beginPath();g.rect(left,top,width,height);g.clip();
  if(p.bands)for(const band of p.ranges){g.fillStyle=band.colour+'52';g.fillRect(left,y(band.high),width,y(band.low)-y(band.high));}
  g.restore();g.font='11px system-ui';g.lineWidth=1;g.textBaseline='middle';
  const step=p.maximum-p.minimum>700?100:50;
  for(let hz=Math.ceil(p.minimum/step)*step;hz<=p.maximum;hz+=step){const yy=y(hz);g.strokeStyle='#a7bbd34d';g.beginPath();g.moveTo(left,yy);g.lineTo(right,yy);g.stroke();g.fillStyle='#b8c8da';g.textAlign='right';g.fillText(String(hz),left-8,yy)}
  g.textAlign='left';g.fillStyle='#b8c8da';g.fillText('Hz',10,15);
  const points=FeatureState.points(rows.filter(r=>r.time<=end),p).filter(r=>r.time>=begin);
  g.save();g.beginPath();g.rect(left,top,width,height);g.clip();g.strokeStyle='#ff9a70';g.lineWidth=2.8;g.lineJoin='round';g.lineCap='round';g.beginPath();let previous=null;
  for(const point of points){if(!point.hz){previous=null;continue}if(point.connected&&previous){g.lineTo(x(point.time),y(point.hz))}else{g.moveTo(x(point.time),y(point.hz))}previous=point;}g.stroke();
  g.fillStyle='#e0efff';for(const point of points){if(point.hz&&point.marker){g.beginPath();g.arc(x(point.time),y(point.hz),2,0,2*Math.PI);g.fill()}}g.restore();
  g.font='10px system-ui';g.fillStyle='#b8c8da';g.textAlign='center';
  for(let i=0;i<=4;i++)g.fillText(i===4?'now':'−'+ +(p.history*(1-i/4)).toFixed(1)+'s',left+width*i/4,h-11);
  chart.dataset.plottedUntil=String(end);chart.dataset.voiced=String(points.filter(r=>r.hz>0).length);
 }
 function controls(force=false){
  const p=state.pitch;for(const [id,value]of [['pitchMinimum',p.minimum],['pitchMaximum',p.maximum],['pitchHistory',p.history],['pitchSmoothing',p.smoothing]])if(force||document.activeElement!==$(id))$(id).value=value;
  $('pitchBands').checked=p.bands;
  if(!$('pitchRanges').children.length)p.ranges.forEach((band,i)=>{
   const group=document.createElement('div');group.className='pitchRange';
   const title=document.createElement('h5');title.textContent='Band '+(i+1);group.append(title);
   const limits=document.createElement('div');limits.className='limits';
   for(const field of ['low','high']){const label=document.createElement('label');label.textContent=field==='low'?'From (Hz)':'To (Hz)';const input=document.createElement('input');input.type='number';input.dataset.band=i;input.dataset.field=field;input.min=50;input.max=1200;input.value=band[field];input.setAttribute('aria-label','Band '+(i+1)+' '+field+' Hz');input.onchange=()=>edit(p=>{p.ranges[i][field]=Number(input.value)});label.append(input);limits.append(label)}
   group.append(limits);$('pitchRanges').append(group);
  });
  for(const input of $('pitchRanges').querySelectorAll('input[data-band]'))if(force||document.activeElement!==input)input.value=p.ranges[Number(input.dataset.band)][input.dataset.field];
 }
 function edit(change){const next=FeatureState.pitch(state.pitch);change(next);let invalid=false;try{state.pitch=FeatureState.pitch(next);$('pitchError').hidden=true;persist();lastPaint='';paint()}catch(error){invalid=true;$('pitchError').textContent=error.message;$('pitchError').hidden=false;}controls(invalid)}
 host.viewLabel=()=>state.active==='pitch'?'Pitch':null;host.featureState=()=>({active:state.active,pitch:FeatureState.pitch(state.pitch)});
 function layout(){
  const signature=[state.active,$('settings').getAttribute('aria-expanded'),window.matchMedia('(min-width: 761px)').matches].join(':');if(signature===lastLayout)return;lastLayout=signature;
  const desktop=window.matchMedia('(min-width: 761px)').matches,nav=$('featureTabs'),toolbar=$('workspaceToolbar');
  if(nav.parentElement!==$('app')||nav.previousElementSibling!==toolbar)$('app').insertBefore(nav,toolbar.nextSibling);
  const pitch=state.active==='pitch';document.getElementById('app').classList.toggle('pitch-active',pitch);chart.hidden=!pitch;$('spectrogramSettings').hidden=pitch;$('pitchSettings').hidden=!pitch;
  $('spectrogramTab').setAttribute('aria-selected',String(!pitch));$('pitchTab').setAttribute('aria-selected',String(pitch));$('spectrogramTab').tabIndex=pitch?-1:0;$('pitchTab').tabIndex=pitch?0:-1;
  $('plot').setAttribute('aria-labelledby',pitch?'pitchTab':'spectrogramTab');
  $('plot').setAttribute('aria-label',pitch?'Live pitch: frequency vertically, time horizontally':'Live spectrogram: frequency vertically, time horizontally');
  $('workspaceToolbar').setAttribute('aria-label','Audio controls');
  if(pitch)$('resolution').textContent='Pitch';
  if($('settings').getAttribute('aria-expanded')==='true'){const label=desktop?'Close settings':'Return to '+state.active;$('settings').setAttribute('aria-label',label);$('settings').title=label;}
 }
 const scrollPositions={spectrogram:0,pitch:0};
 function select(feature){if(feature===state.active)return;scrollPositions[state.active]=$('settingsBody').scrollTop;state.active=feature;persist();lastPaint='';layout();$('settingsBody').scrollTop=scrollPositions[feature];if(feature==='spectrogram')updateResolution();syncPitch();paint()}
 $('featureTabs').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const feature=event.key==='Home'?'spectrogram':event.key==='End'?'pitch':state.active==='pitch'?'spectrogram':'pitch';select(feature);$(feature+'Tab').focus()}});
 $('spectrogramTab').onclick=()=>select('spectrogram');$('pitchTab').onclick=()=>select('pitch');
 for(const [id,field]of [['pitchMinimum','minimum'],['pitchMaximum','maximum'],['pitchHistory','history']])$(id).onchange=()=>edit(p=>{p[field]=Number($(id).value)});
 $('pitchSmoothing').onchange=()=>edit(p=>{p.smoothing=$('pitchSmoothing').value});$('pitchBands').onchange=()=>edit(p=>{p.bands=$('pitchBands').checked});$('resetPitch').onclick=()=>{state.pitch=FeatureState.pitch();$('pitchError').hidden=true;persist();controls(true);lastPaint='';paint()};
 host.subscribe(type=>{if(type==='stop'||type==='seek'){reset();pumping=false;}if(type==='capture'||type==='seek')syncPitch();if(type==='render'||type==='layout'){layout();paint()}});
 controls();layout();
})();
