const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
(async()=>{
 const {createCapture,validateClock}=await import('./capture.mjs');await assert.rejects(createCapture({}),/Confirm native/);
 assert.throws(()=>validateClock({runId:'test',phase:'running',seconds:99,wall:0},'test'),/stale/);
 assert.throws(()=>validateClock({runId:'test',phase:'completed',seconds:99,wall:Date.now()/1000},'test'),/stale/);
 assert.throws(()=>validateClock({runId:'test',phase:'running',seconds:10,wall:Date.now()/1000,rate:48000,inputDevice:1,currentInput:2},'test'),/stale/);
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'pitch-capture-'));try{
  await fs.writeFile(path.join(folder,'run.json'),JSON.stringify({runId:'test',clips:[{id:'control',pcmSha256:'abc',start:0,end:1}]}));
  const tab={playwright:{evaluate:async()=>({pitchPreset:'soundglow',pitchConfirmation:'50',pitchGap:'200',pitchSpeechGate:true,pitchMinimum:'50',pitchMaximum:'500',pitchHistory:'10',pitchActive:true,dpr:1}),locator:id=>({textContent:async()=>id==='#state'?'LIVE':'BlackHole 2ch',evaluate:async()=>({x:0,y:0,width:100,height:100,end:'1'})})},screenshot:async()=>Buffer.from('test')},nativeApp={getScreenshot:async()=>Buffer.from('test')};
  let reads=0;const fakeFs={...fs,readFile:async(file,...args)=>String(file).endsWith('status.json')?JSON.stringify({phase:'running',currentInput:1,inputDevice:1,rate:48000,runId:'test',seconds:++reads===1?1.26:1.56,wall:Date.now()/1000}):fs.readFile(file,...args)};
  const cap=await createCapture({nativeApp,tab,fs:fakeFs,folder,nativeSettingsConfirmed:true});await cap.capture(1);const result=JSON.parse(await fs.readFile(path.join(folder,'captures.json')));assert.equal(result.runId,'test');assert.equal(result.rows[0].late,false);assert.equal(result.rows[0].pcmSha256,'abc');assert.equal(result.clockVersion,2);assert.deepEqual(result.rows[0].nativeInterval,[1.52,1.6]);
  let slowReads=0;const delayedFs={...fs,readFile:async(file,...args)=>String(file).endsWith('status.json')?JSON.stringify({runId:'test',phase:'running',rate:48000,inputDevice:1,currentInput:1,seconds:++slowReads<=2?1.26:2.3,wall:Date.now()/1000}):fs.readFile(file,...args)};
  const delayed=await createCapture({nativeApp,tab,fs:delayedFs,folder,nativeSettingsConfirmed:true});await delayed.capture(1);assert.equal(delayed.rows[0].late,true,'A screenshot that finishes late must be invalid even if it starts on time');
  await fs.writeFile(path.join(folder,'status.json'),JSON.stringify({runId:'test',phase:'running',seconds:99,wall:0,rate:48000,inputDevice:1,currentInput:1}));const expired=await createCapture({nativeApp,tab,fs,folder,nativeSettingsConfirmed:true});await assert.rejects(expired.capture(1),/stale/);
  await fs.writeFile(path.join(folder,'status.json'),JSON.stringify({runId:'wrong'}));const stale=await createCapture({nativeApp,tab,fs,folder,nativeSettingsConfirmed:true});await assert.rejects(stale.capture(1),/different run/);
 }finally{await fs.rm(folder,{recursive:true,force:true})}
 console.log('PASS: capture preflight, paired artifacts, PCM identity and stale-run rejection');
})().catch(e=>{console.error(e);process.exitCode=1});
