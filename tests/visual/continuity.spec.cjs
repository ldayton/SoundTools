const {test,expect}=require('@playwright/test');
test('sidebar and display changes preserve frozen source history and live playback',async({page},testInfo)=>{
 const slowdown=Number(process.env.SOUNDGLOW_CPU_SLOWDOWN||testInfo.project.metadata.cpuSlowdown||1);
 if(slowdown>1){const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:slowdown});}
 await page.setViewportSize(testInfo.project.metadata.viewport||{width:1280,height:900});await page.goto('/dist/index.html');await page.locator('#demo').click();
 await page.waitForFunction(()=>Number(canvas.dataset.plottedUntil)>3);await page.locator('#freeze').click();await page.waitForFunction(()=>!engine.busy);
 const snapshot=(pixels=true)=>page.evaluate(pixels=>{
  let hash=null;
  if(pixels){const image=ctx.getImageData(pxLeft,pxTop,pxW,pxH).data;hash=2166136261;for(const byte of image)hash=Math.imul(hash^byte,16777619)>>>0;}
  const end=Number(canvas.dataset.plottedUntil),visible=spectrumHistory.frames.filter(frame=>frame.time<=end);
  return {hash,end,generation:engine.generation,frames:visible.length,bytes:visible.reduce((sum,frame)=>sum+frame.power.byteLength,0)};
 },pixels);
 await page.evaluate(()=>redraw());const before=await snapshot();
 for(let i=0;i<4;i++){await page.locator('#openSettings').click();await page.waitForTimeout(350)}
 expect(await snapshot()).toEqual(before);
 await page.locator('#openSettings').click();await page.waitForTimeout(350);
 for(const [id,value] of [['scale','linear'],['preemphasis','6'],['history','3'],['colourLevels','auto'],['peakDecay','0.98'],['colourLevels','fixed'],['scale','voice'],['preemphasis','3'],['history','6'],['peakDecay','0.995']]){
  const control=page.locator('#'+id);if(await control.evaluate(el=>el.tagName==='SELECT'))await control.selectOption(value);else await control.fill(value);
  const now=await snapshot();expect(now.end).toBe(before.end);expect(now.generation).toBe(before.generation);expect(now.frames).toBe(before.frames);
 }
 await page.locator('#openSettings').click();await page.waitForTimeout(350);expect(await snapshot()).toEqual(before);
 await page.locator('#freeze').click();const start=await snapshot(false);
 for(let i=0;i<4;i++){await page.locator('#openSettings').click();await page.waitForTimeout(350)}
 await page.waitForFunction(end=>Number(canvas.dataset.plottedUntil)>end+.5,start.end);
 expect(await page.evaluate(()=>engine.generation)).toBe(start.generation);
 expect(await page.evaluate(()=>processingStats.discontinuousBatches||0)).toBe(0);
 expect(await page.evaluate(()=>running&&!paused&&assertSettingsConsistent())).toBe(true);
});
test('English playback survives rapid DSP changes and frozen rebuild matches fresh analysis',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await page.goto('/dist/index.html');await page.locator('#demo').click();
 await page.waitForFunction(()=>Number(canvas.dataset.plottedUntil)>3);
 await page.evaluate(()=>{
  window.originalTransport={engine,audio,source,pcmNode};window.committedWindows=[];window.plotTimes=[];
  const commit=engine.onReconfigured;engine.onReconfigured=groups=>{committedWindows.push(engine.activeSettings.windowSeconds);commit(groups)};
  const monitor=()=>{if(!running)return;plotTimes.push(Number(canvas.dataset.plottedUntil));requestAnimationFrame(monitor)};monitor();
  updateSettings({type:'edit',id:'window',value:'0.015'});
  updateSettings({type:'edit',id:'window',value:'0.064'});
  updateSettings({type:'edit',id:'window',value:'0.04'});
  if(viewSetting('window')!=='0.025')throw Error('Pending analysis changed the committed renderer');
 });
 await page.waitForFunction(()=>engine.activeSettings.windowSeconds===.04&&!engine.rebuild);
 expect(await page.evaluate(()=>committedWindows)).toEqual([.04]);expect(await page.evaluate(()=>viewSetting('window'))).toBe('0.04');
 expect(await page.evaluate(()=>Object.entries(originalTransport).every(([key,object])=>({engine,audio,source,pcmNode})[key]===object))).toBe(true);
 await page.waitForFunction(()=>Number(canvas.dataset.plottedUntil)>4);await page.locator('#freeze').click();await page.waitForFunction(()=>!engine.busy);
 const end=await page.evaluate(()=>Number(canvas.dataset.plottedUntil));
 await page.evaluate(()=>updateSettings({type:'edit',id:'window',value:'0.015'}));
 await page.waitForFunction(()=>engine.activeSettings.windowSeconds===.015&&!engine.rebuild);
 expect(await page.evaluate(()=>Number(canvas.dataset.plottedUntil))).toBe(end);
 const comparison=await page.evaluate(async()=>{
  const expected=[],config={...engine.activeSettings};let failure;
  const client=new PraatClient({workerURL:praatWorkerURL});await client.init();
  const fresh=new PraatStream({retain:false,client,sampleRate:audio.sampleRate,settings:()=>config,onFrames:frames=>expected.push(...frames),onError:error=>failure=error});
  for(const block of engine.raw)await fresh.push(block.pcm.slice(),block.start);
  if(failure)throw failure;
  const actual=spectrumHistory.frames;let error=0;
  if(actual.length!==expected.length)throw Error('Frame count differs');
  for(let i=0;i<actual.length;i++){
   if(Math.abs(actual[i].time-expected[i].time)>1e-8||actual[i].power.length!==expected[i].power.length)throw Error('Frame geometry differs');
   for(let k=0;k<actual[i].power.length;k++)error=Math.max(error,Math.abs(actual[i].power[k]-expected[i].power[k]));
  }
  fresh.dispose();return {error,wallSpan:actual.at(-1).wallTime-actual[0].wallTime,frames:actual.length,monotonic:plotTimes.every((time,i)=>!i||time>=plotTimes[i-1]-1e-8)};
 });
 expect(comparison.wallSpan).toBeGreaterThan(2);expect(comparison.frames).toBeGreaterThan(300);expect(comparison.error).toBe(0);expect(comparison.monotonic).toBe(true);
 await page.locator('#freeze').click();await page.waitForFunction(end=>Number(canvas.dataset.plottedUntil)>end+.5,end);
 expect(await page.evaluate(()=>running&&!paused&&assertSettingsConsistent())).toBe(true);
});
test('speech pause retains queued capture packets and resumes continuously',async({page})=>{
 await page.goto('/dist/index.html');await page.locator('#demo').click();await page.waitForFunction(()=>Number(canvas.dataset.plottedUntil)>1);
 const generation=await page.evaluate(()=>{
  window.heldCapturePackets=[];window.deliverCapturePacket=pcmNode.port.onmessage;
  pcmNode.port.onmessage=event=>heldCapturePackets.push(event.data);
  return engine.generation;
 });
 // Force the MessagePort ordering from CI: audio was produced before pause,
 // but its already-posted packets reach the app only after suspend resolves.
 await page.waitForFunction(()=>heldCapturePackets.length>0);await page.locator('#freeze').click();
 const before=await page.evaluate(()=>Number(canvas.dataset.plottedUntil));
 const delivered=await page.evaluate(async()=>{
  let count=0;
  while(heldCapturePackets.length){
   deliverCapturePacket({data:heldCapturePackets.shift()});count++;
   while(engine.busy)await new Promise(resolve=>setTimeout(resolve,0));
  }
  pcmNode.port.onmessage=deliverCapturePacket;return count;
 });
 expect(delivered).toBeGreaterThan(0);expect(await page.evaluate(()=>Number(canvas.dataset.plottedUntil))).toBe(before);
 await page.locator('#freeze').click();await page.waitForFunction(end=>Number(canvas.dataset.plottedUntil)>end+.5,before);
 expect(await page.evaluate(()=>engine.generation)).toBe(generation);
 expect(await page.evaluate(()=>processingStats.discontinuousBatches||0)).toBe(0);
});
