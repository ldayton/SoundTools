const {test,expect}=require('@playwright/test');
async function setup(page){
 await page.goto('/dist/index.html');
 await page.evaluate(async()=>{
  const context=new OfflineAudioContext(1,1,48000),buffer=await context.decodeAudioData(await(await fetch('/dist/audio/alice-waters.m4a')).arrayBuffer());window.neuralTestPCM=buffer.getChannelData(0);window.neuralTestWorker=new Worker('/dist/vendor/praat/live-worker.js?profile=release');window.neuralTestIndex=0;
  window.neuralRequest=neural=>new Promise((resolve,reject)=>{const i=window.neuralTestIndex++,pcm=new Float32Array(4800);for(let n=0;n<pcm.length;n++)pcm[n]=window.neuralTestPCM[(i*4800+n)%window.neuralTestPCM.length];const timer=setTimeout(()=>reject(Error('Worker stalled')),3000);window.neuralTestWorker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(Error(data.error)):resolve(data)};window.neuralTestWorker.postMessage({id:i+1,type:'speech',session:'browser-neural-test',neural,pcm,start:i*.1,sampleRate:48000},[pcm.buffer]);});
 });
}
test('optional neural worker loads off the pitch worker and produces real speech evidence',async({page})=>{
 await setup(page);const first=await page.evaluate(()=>window.neuralRequest(true));expect(first.neuralStatus).toBe('loading');expect(first.decisions).toHaveLength(10);
 let ready;for(let i=0;i<150;i++){await page.waitForTimeout(100);const r=await page.evaluate(()=>window.neuralRequest(true));if(r.neuralStatus==='unavailable')throw Error('Neural engine unavailable: '+r.neuralError);if(r.neuralActive){ready=r;break;}}
 expect(ready).toBeTruthy();expect(ready.neuralDecisions.length).toBeGreaterThan(0);expect(ready.neuralDecisions.every(f=>Number.isFinite(f.probability)&&f.probability>=0&&f.probability<=1)).toBe(true);
 const off=await page.evaluate(()=>window.neuralRequest(false));expect(off.neuralActive).toBe(false);expect(off.neuralStatus).toBe('off');const resumed=await page.evaluate(()=>window.neuralRequest(true));expect(resumed.neuralActive).toBe(true);await page.evaluate(()=>window.neuralTestWorker.terminate());
});
test('speech model download failure keeps the existing gate operational',async({page})=>{
 await page.route('**/vendor/neural/**/silero.onnx',route=>route.abort());await setup(page);const first=await page.evaluate(()=>window.neuralRequest(true));expect(first.decisions).toHaveLength(10);
 let failed;for(let i=0;i<100;i++){await page.waitForTimeout(100);const r=await page.evaluate(()=>window.neuralRequest(true));if(r.neuralStatus==='unavailable'){failed=r;break;}}
 expect(failed).toBeTruthy();expect(failed.decisions).toHaveLength(10);expect(failed.neuralActive).toBe(false);await page.evaluate(()=>window.neuralTestWorker.terminate());
});
test('disabled speech filtering does not download optional neural assets',async({page})=>{
 const requests=[];page.on('request',r=>{if(r.url().includes('/vendor/neural/'))requests.push(r.url())});await setup(page);for(let i=0;i<3;i++)expect((await page.evaluate(()=>window.neuralRequest(false))).neuralStatus).toBe('off');expect(requests).toEqual([]);await page.evaluate(()=>window.neuralTestWorker.terminate());
});
test('production defaults keep the experimental gate off; explicit URL enables it',async({page})=>{
 const assets=[];page.on('request',r=>{if(r.url().includes('/vendor/neural/'))assets.push(r.url())});
 await page.goto('/dist/index.html');await page.getByRole('tab',{name:'Pitch',exact:true}).click();await page.getByRole('button',{name:'Play an Example',exact:true}).click();
 await expect.poll(()=>page.locator('#pitchCanvas').getAttribute('data-neural-status')).toBe('off');expect(assets).toEqual([]);
 await page.goto('/dist/index.html?experimentalSpeechGate=1');await page.getByRole('button',{name:'Play an Example',exact:true}).click();await expect.poll(()=>page.locator('#pitchCanvas').getAttribute('data-neural-status'),{timeout:20000}).toBe('ready');expect(assets.length).toBeGreaterThan(0);
});
