const {test,expect}=require('@playwright/test'),path=require('node:path');
test('pitch speech filtering survives fake microphone capture and transport/settings changes',async({playwright},info)=>{
 test.setTimeout(45000);
 const browser=await playwright.chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.resolve(process.env.SOUNDGLOW_PITCH_AUDIO||path.join(__dirname,'generated/capture.wav'))]});
 try{
  const context=await browser.newContext({viewport:info.project.name==='desktop'?{width:1280,height:900}:info.project.use.viewport,deviceScaleFactor:info.project.use.deviceScaleFactor,permissions:['microphone']});const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8779/dist/index.html');await page.getByRole('tab',{name:'Pitch',exact:true}).click();await page.locator('#begin').click();
  await page.waitForFunction(()=>Number(document.getElementById('pitchCanvas').dataset.voiced)>10,undefined,{timeout:20000});await expect(page.locator('#state')).toHaveText('LIVE');
  await page.evaluate(()=>{window.microphonePolicyTransport={engine,stream,pcmNode,audio}});
  await page.locator(await page.locator('#openSettings').isVisible()?'#openSettings':'#settings').click();await page.locator('#advancedPitchTrace > summary').click();await page.locator('#pitchSpeechGate').uncheck();await page.locator('#pitchSpeechGate').check();await page.locator('#pitchConfirmation').selectOption('30');await page.locator('#pitchPreset').selectOption('soundglow');
  if(info.project.name!=='desktop')await page.locator('#settings').click();else await page.locator('#openSettings').click();
  await page.locator('#freeze').click();await expect(page.locator('#state')).toHaveText('PAUSED');const frozen=await page.locator('#pitchCanvas').getAttribute('data-plotted-until');await page.waitForTimeout(200);expect(await page.locator('#pitchCanvas').getAttribute('data-plotted-until')).toBe(frozen);await page.locator('#freeze').click();
  await page.waitForFunction(t=>Number(document.getElementById('pitchCanvas').dataset.plottedUntil)>Number(t)+.4,frozen);await expect(page.locator('#pitchError')).toBeHidden();
  expect(await page.evaluate(()=>Object.entries(microphonePolicyTransport).every(([k,v])=>({engine,stream,pcmNode,audio})[k]===v))).toBe(true);expect(errors).toEqual([]);
 }finally{await browser.close()}
});
