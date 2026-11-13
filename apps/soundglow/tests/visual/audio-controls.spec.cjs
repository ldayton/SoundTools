const {test,expect}=require('@playwright/test');
test.beforeEach(async({page},info)=>{test.skip(info.project.name!=='desktop');await page.setViewportSize({width:1280,height:900});await page.goto('/dist/index.html');await page.evaluate(()=>fileLibrary.ready);});
function wave(seconds=2){const rate=48000,frames=Math.round(rate*seconds),data=Buffer.alloc(44+frames*2);data.write('RIFF',0);data.writeUInt32LE(36+frames*2,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++){const t=i/rate,hz=t>=.4&&t<.6?440:880;data.writeInt16LE(Math.round(Math.sin(i/rate*2*Math.PI*hz)*10000),44+2*i);}return {name:'bounds.wav',mimeType:'audio/wav',buffer:data};}
async function load(page,seconds){await page.locator('#audioFileInput').setInputFiles(wave(seconds));await page.waitForFunction(()=>fileLibrary.current&&!fileLibrary.loading);}
test('Escape, pointer cancellation, lost capture and focus loss discard draft boundary changes',async({page})=>{
 await load(page);await page.evaluate(()=>{fileLibrary.loop={start:.4,end:.6};fileLibrary.setView(0,1);});
 for(const abort of ['Escape','pointercancel','lostpointercapture','blur']){
  const box=await page.locator('#fileWaveform').boundingBox();await page.mouse.move(box.x+box.width*.4,box.y+30);await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+30,{steps:4});
  expect(await page.evaluate(()=>fileLibrary.loop.start)).toBe(.4);
  if(abort==='Escape')await page.keyboard.press('Escape');else if(abort==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));else await page.dispatchEvent('#fileWaveform',abort,{pointerId:1});
  expect(await page.evaluate(()=>fileLibrary.drag)).toBeNull();expect(await page.evaluate(()=>fileLibrary.loop.start)).toBe(.4);await page.mouse.up();
 }
});
test('release coordinates, 50ms selection and exact fit work through real controls',async({page})=>{
 await load(page);await page.evaluate(()=>{fileLibrary.loop={start:.4,end:.8};fileLibrary.setView(0,1);});const box=await page.locator('#fileWaveform').boundingBox();
 await page.mouse.move(box.x+box.width*.4,box.y+30);await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+30);
 await page.evaluate(x=>fileLibrary.pointerUp({pointerId:1,clientX:x}),box.x+box.width*.55);await page.mouse.up();expect(await page.evaluate(()=>fileLibrary.loop.start)).toBeCloseTo(.55,4);
 await page.evaluate(()=>{fileLibrary.loop=null;fileLibrary.setView(.4,.5);});
 await page.mouse.move(box.x+box.width*.2,box.y+30);await page.mouse.down();await page.mouse.move(box.x+box.width*.3,box.y+30,{steps:5});await page.mouse.up();
 const selected=await page.evaluate(()=>fileLibrary.loop.end-fileLibrary.loop.start);expect(Math.abs(selected-.05)).toBeLessThan(.5/box.width+1/48000);await page.locator('#waveformFitSelection').click();expect(await page.evaluate(()=>fileLibrary.viewSpan)).toBeCloseTo(selected,8);await page.waitForFunction(()=>Number(canvas.dataset.fileFrames)>0);await page.screenshot({path:'/tmp/soundglow-fixed-controls.png'});
});
test('audio-clock loop never leaks outside its passage while the UI thread stalls',async({page})=>{
 await load(page);await page.evaluate(()=>{fileLibrary.loop={start:.4,end:.6};document.getElementById('fileLoop').checked=true;fileLibrary.seek(.4);});await page.locator('#filePlay').click();await page.waitForFunction(()=>fileLibrary.playback.active);
 await page.evaluate(async()=>{
  const context=fileLibrary.playback.context;window.probeRows=[];
  const url=URL.createObjectURL(new Blob([`class Probe extends AudioWorkletProcessor {constructor(){super();this.samples=[];}process(inputs){for(const value of inputs[0]?.[0]||[])this.samples.push(value);if(this.samples.length>=4096){let squares=0,cross=0;for(let i=1;i<this.samples.length;i++){squares+=this.samples[i]*this.samples[i];if(this.samples[i-1]<=0&&this.samples[i]>0)cross++;}this.port.postMessage({rms:Math.sqrt(squares/this.samples.length),hz:cross*sampleRate/this.samples.length});this.samples=[];}return true;}}registerProcessor('bounds-probe',Probe);`],{type:'text/javascript'}));
  await context.audioWorklet.addModule(url);URL.revokeObjectURL(url);window.probe=new AudioWorkletNode(context,'bounds-probe');probe.port.onmessage=e=>probeRows.push(e.data);fileLibrary.playback.gain.connect(probe);probe.connect(context.destination);
  // Native audio rendering must stay correct even when no UI callbacks can run.
  const until=performance.now()+450;while(performance.now()<until){}
 });
 await page.waitForFunction(()=>probeRows.filter(r=>r.rms>.05).length>=4);
 const result=await page.evaluate(()=>({rows:probeRows.filter(r=>r.rms>.05),position:fileLibrary.position,loop:fileLibrary.playback.nodes.values().next().value.loop}));
 expect(result.loop).toBe(true);expect(result.position).toBeGreaterThanOrEqual(.4);expect(result.position).toBeLessThan(.6);
 for(const row of result.rows)expect(row.hz).toBeLessThan(500);
 await page.locator('#filePlay').click();expect(await page.evaluate(()=>fileLibrary.isPaused)).toBe(true);
});
test('slower precise playback preserves pitch and cancels safely during preparation',async({page})=>{
 await load(page);await page.evaluate(()=>{fileLibrary.loop={start:.4,end:.6};fileLibrary.media.playbackRate=.5;document.getElementById('fileLoop').checked=true;});await page.locator('#filePlay').click();await page.waitForFunction(()=>fileLibrary.playback.active);
 const measured=await page.evaluate(()=>{const buffer=fileLibrary.playback.cache.buffer,samples=buffer.getChannelData(0);let count=0,energy=0;for(let i=1;i<samples.length;i++){if(samples[i-1]<=0&&samples[i]>0)count++;energy+=samples[i]*samples[i];}return {duration:buffer.duration,hz:count/buffer.duration,rms:Math.sqrt(energy/samples.length)};});
 expect(measured.duration).toBeCloseTo(.4,3);expect(measured.hz).toBeGreaterThan(400);expect(measured.hz).toBeLessThan(480);expect(measured.rms).toBeGreaterThan(.05);await page.locator('#filePlay').click();
 await page.evaluate(()=>{fileLibrary.playback.cache=null;const read=fileLibrary.reader.read.bind(fileLibrary.reader);let trapped=false;fileLibrary.reader.read=async(...args)=>{if(!trapped&&args[2]-args[1]<.3){trapped=true;await new Promise(resolve=>window.releaseDecode=resolve);}return read(...args);};});
 await page.locator('#filePlay').click();await page.waitForFunction(()=>typeof releaseDecode==='function');await page.locator('#filePlay').click();await page.evaluate(()=>releaseDecode());await page.waitForFunction(()=>!fileLibrary.playTask);
 expect(await page.evaluate(()=>fileLibrary.isPaused&&!fileLibrary.playback.active&&!fileLibrary.wantPlay)).toBe(true);
});
test('long PCM files decode only requested ranges and long passages use a bounded queue',async({page})=>{
 const allocation=await page.evaluate(async()=>{
  const seconds=600,rate=48000,bytes=seconds*rate*2,header=new ArrayBuffer(44),view=new DataView(header);const text=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,36+bytes,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,bytes,true);
  class RangeOnlyBlob extends Blob {arrayBuffer(){throw Error('Whole-file decode is forbidden');}}
  const blob=new RangeOnlyBlob([header,new Uint8Array(bytes)],{type:'audio/wav'}),reader=new SoundglowFileAudio.FileAudioReader();const buffer=await reader.read(blob,500,500.5,16000);reader.clear();return {length:buffer.length,bytes:reader.largestWindowBytes};
 });
 expect(allocation.length).toBe(8000);expect(allocation.bytes).toBeLessThan(100000);
 await load(page,44);await page.evaluate(()=>{fileLibrary.loop={start:2,end:42};document.getElementById('fileLoop').checked=true;});await page.locator('#filePlay').click();await page.waitForFunction(()=>fileLibrary.playback.active&&fileLibrary.playback.segments.length>=2);
 const queued=await page.evaluate(()=>({mode:fileLibrary.playback.mode,nodes:fileLibrary.playback.nodes.size,bytes:fileLibrary.reader.largestWindowBytes}));expect(queued.mode).toBe('queue');expect(queued.nodes).toBeLessThanOrEqual(5);expect(queued.bytes).toBeLessThanOrEqual(2*48000*4);await page.locator('#filePlay').click();
});

test('changing loop mode and switching files stops retired audio nodes',async({page})=>{
 await load(page);await page.evaluate(()=>{fileLibrary.loop={start:.4,end:.6};document.getElementById('fileLoop').checked=true;});await page.locator('#filePlay').click();await page.waitForFunction(()=>fileLibrary.playback.active);
 await page.locator('#fileLoop').uncheck();await page.waitForFunction(()=>fileLibrary.isPaused&&!fileLibrary.playTask);expect(await page.evaluate(()=>fileLibrary.position)).toBeCloseTo(.6,3);
 await page.locator('#fileLoop').check();await page.locator('#filePlay').click();await page.waitForFunction(()=>fileLibrary.playback.active);
 await page.evaluate(()=>{window.retiredNodes=[...fileLibrary.playback.nodes];});await page.locator('#audioFileInput').setInputFiles(wave());await expect(page.locator('#audioFileList button')).toHaveCount(2);
 await page.evaluate(()=>fileLibrary.select(fileLibrary.files[1].id));expect(await page.evaluate(()=>fileLibrary.playback.nodes.size)).toBe(0);expect(await page.evaluate(()=>fileLibrary.isPaused)).toBe(true);
 await page.locator('#filePlay').click();await page.waitForFunction(()=>!fileLibrary.isPaused);await page.locator('#filePlay').click();
});
test('rapid seeks keep the latest playback intent and an explicit pause cancels queued restarts',async({page})=>{
 await load(page);await page.evaluate(()=>{fileLibrary.loop={start:.4,end:.6};document.getElementById('fileLoop').checked=true;});await page.locator('#filePlay').click();await page.waitForFunction(()=>fileLibrary.playback.active);
 const trap=()=>{fileLibrary.playback.cache=null;const read=fileLibrary.reader.read.bind(fileLibrary.reader);let trapped=false;fileLibrary.reader.read=async(...args)=>{if(!trapped&&args[2]-args[1]<.3){trapped=true;await new Promise(resolve=>window.releaseSeek=resolve);}return read(...args);};window.releaseSeek=null;fileLibrary.seek(.45);};
 await page.evaluate(trap);await page.waitForFunction(()=>typeof releaseSeek==='function');await page.evaluate(()=>{fileLibrary.seek(.5);fileLibrary.seek(.55);releaseSeek();});await page.waitForFunction(()=>fileLibrary.playback.active&&!fileLibrary.playTask);
 expect(await page.evaluate(()=>fileLibrary.playback.initial)).toBeCloseTo(.15,3);
 await page.evaluate(trap);await page.waitForFunction(()=>typeof releaseSeek==='function');await page.evaluate(()=>{fileLibrary.seek(.5);fileLibrary.pause();releaseSeek();});await page.waitForFunction(()=>!fileLibrary.playTask);
 expect(await page.evaluate(()=>!fileLibrary.playback.active&&!fileLibrary.wantPlay&&!fileLibrary.resumeAfterRestart)).toBe(true);
});
test('chunked storage rolls back failed imports, preserves duplicates, and prunes only expired staging',async({page})=>{
 const result=await page.evaluate(async()=>{
  const store=fileLibrary.store,id=crypto.randomUUID(),meta={id,name:'storage-test.wav',duration:1,position:0,addedAt:Date.now()},transaction=store.transaction.bind(store);let writes=0,error;
  store.transaction=async(stores,action,mode)=>{if(stores.length===1&&stores[0]==='blobs'&&mode!=='readonly'&&++writes===3)throw Object.assign(Error('full'),{name:'QuotaExceededError'});return transaction(stores,action,mode);};
  try{await store.add(meta,new Blob([new Uint8Array(3*1024*1024)]));}catch(e){error=e.name;}finally{store.transaction=transaction;}
  const keys=()=>store.transaction(['blobs'],tx=>tx.objectStore('blobs').getAllKeys(),'readonly');
  const clean=(await keys()).every(key=>Array.isArray(key)?key[0]!==id:key!==id)&&(await store.list()).every(file=>file.id!==id);
  await store.add(meta,new Blob(['original']));try{await store.add(meta,new Blob(['replacement']));}catch{}
  const preserved=await (await store.get(id)).text();await store.remove(id);
  for(const [name,age] of [['expired',2*86400000],['fresh',1000]])await store.transaction(['blobs'],tx=>{const blobs=tx.objectStore('blobs');blobs.put({kind:'chunks',complete:false,createdAt:Date.now()-age},name);blobs.put(new ArrayBuffer(1),[name,0]);});
  await store.pruneStaged();const remaining=await keys();return {error,clean,preserved,expired:remaining.some(key=>Array.isArray(key)?key[0]==='expired':key==='expired'),fresh:remaining.some(key=>key==='fresh')};
 });
 expect(result).toEqual({error:'QuotaExceededError',clean:true,preserved:'original',expired:false,fresh:true});
});
test('Play restarts a completed non-looping selection and still resumes an intentional pause',async({page})=>{
 await load(page);await page.evaluate(()=>{fileLibrary.loop={start:.41325,end:.653271};fileLibrary.seek(fileLibrary.loop.start);document.getElementById('fileLoop').checked=false;});
 await page.locator('#filePlay').click();await page.waitForFunction(()=>fileLibrary.isPaused&&!fileLibrary.wantPlay&&!fileLibrary.playTask);
 // A media element may quantize currentTime just below the requested endpoint.
 await page.evaluate(()=>{fileLibrary.media.currentTime=fileLibrary.loop.end-.00001;});
 await page.locator('#filePlay').click();await page.waitForFunction(()=>fileLibrary.playback.active);expect(await page.evaluate(()=>fileLibrary.playback.initial)).toBe(0);
 await page.locator('#filePlay').click();await page.evaluate(()=>fileLibrary.seek(fileLibrary.loop.start+.1));await page.locator('#filePlay').click();await page.waitForFunction(()=>fileLibrary.playback.active);expect(await page.evaluate(()=>fileLibrary.playback.initial)).toBeCloseTo(.1,4);await page.locator('#filePlay').click();
});
