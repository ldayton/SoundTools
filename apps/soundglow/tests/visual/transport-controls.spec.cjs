const {test,expect}=require('./fixtures.cjs');
const {setSetting}=require('./settings-input.cjs');
test('example controls preserve pause, seek, loop and listening independently of inspector navigation',async({page},info)=>{
 await page.addInitScript(require('../../../../packages/browser-controls/test-fixtures/media-session.cjs').mediaSessionProbe);
 await page.goto('/dist/index.html');await page.locator('#demo').click();await page.waitForFunction(()=>running&&inputMode==='speech'&&processingStats.frames>50);await page.locator('#freeze').click();await expect(page.locator('#state')).toHaveText('PAUSED');
 await page.locator(await page.locator('#openSettings').isVisible()?'#openSettings':'#settings').click();await page.locator('#loop').uncheck();await page.locator('#listen').uncheck();expect(await page.evaluate(()=>({loop:speechNode.loop,gain:monitor.gain.value,paused}))).toEqual({loop:false,gain:0,paused:true});
 if(await page.evaluate(()=>!!navigator.mediaSession)) {
 await page.evaluate(()=>{window.mediaActions.get('play')({action:'play'});window.mediaActions.get('play')({action:'play'});});
 await page.waitForFunction(()=>!paused&&!starting);
 expect(await page.evaluate(()=>navigator.mediaSession.playbackState)).toBe('playing');
 await page.evaluate(()=>{window.mediaActions.get('pause')({action:'pause'});window.mediaActions.get('pause')({action:'pause'});});
 await page.waitForFunction(()=>paused&&!starting);
 expect(await page.evaluate(()=>navigator.mediaSession.playbackState)).toBe('paused');
 await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','false');
 } else { expect(await page.evaluate(()=>window.mediaActions.size)).toBe(0); }
 await setSetting(page,'seek','12');expect(await page.evaluate(()=>clipOffset)).toBeCloseTo(12,1);await expect(page.locator('#state')).toHaveText('PAUSED');await page.locator('#restart').click();expect(await page.evaluate(()=>clipOffset)).toBe(0);await expect(page.locator('#loop')).not.toBeChecked();await expect(page.locator('#listen')).not.toBeChecked();
 await page.locator('#loop').focus();await page.keyboard.press('Space');await expect(page.locator('#loop')).toBeChecked();await expect(page.locator('#state')).toHaveText('PAUSED');
 if(!await page.locator('#freeze').isVisible())await page.locator('#settings').click();await page.locator('#freeze').click();await page.waitForFunction(()=>!paused&&speechPosition()>.2);await expect(page.locator('#state')).toHaveText('EXAMPLE');
});
test('microphone enumeration preserves choice and ignores a retired refresh',async({page})=>{
 await page.addInitScript(()=>{window.refreshes=[];Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{enumerateDevices:()=>new Promise(resolve=>refreshes.push(resolve))}})});
 await page.goto('/dist/index.html#settings');await page.waitForFunction(()=>refreshes.length>0);await page.evaluate(()=>refreshes.splice(0).forEach(resolve=>resolve([{kind:'audioinput',deviceId:'chosen',label:'Test microphone'}])));await page.locator('#microphone').selectOption('chosen');
 await page.locator('#refreshMic').click();await page.waitForFunction(()=>refreshes.length===1);await page.locator('#refreshMic').click();await page.waitForFunction(()=>refreshes.length===2);
 await page.evaluate(()=>refreshes[1]([{kind:'audioinput',deviceId:'chosen',label:'Latest microphone'}]));await expect(page.locator('#microphone option:checked')).toHaveText('Latest microphone');await page.evaluate(()=>refreshes[0]([]));await expect(page.locator('#microphone')).toHaveValue('chosen');await expect(page.locator('#microphone option:checked')).toHaveText('Latest microphone');
});
test('seeking to the example end keeps the slider within its exact duration',async({page})=>{
 await page.goto('/dist/index.html');await page.locator('#demo').click();await page.waitForFunction(()=>running&&inputMode==='speech');await page.locator('#freeze').click();await page.locator('#openSettings:visible, #settings:visible').click();
 const slider=page.locator('#seek-slider'),maximum=Number(await slider.getAttribute('aria-valuemax'));await slider.press('End');await expect(slider).toHaveAttribute('aria-valuenow',String(maximum));expect(await page.evaluate(()=>clipOffset)).toBeLessThanOrEqual(maximum);await expect(page.locator('#state')).toHaveText('PAUSED');
});


test('system file play and pause preserve intent during a pending resume', async ({page}, info) => {
 test.skip(info.project.name !== 'desktop', 'Saved recordings are desktop only');
 await page.setViewportSize({width:1280,height:900});
 await page.addInitScript(require('../../../../packages/browser-controls/test-fixtures/media-session.cjs').mediaSessionProbe);
 await page.goto('/dist/index.html');
 await page.evaluate(() => fileLibrary.ready);
 await page.locator('#audioFileInput').setInputFiles(require('node:path').resolve(__dirname,'../../dist/audio/alice-waters.m4a'));
 await page.waitForFunction(() => fileLibrary.current && !fileLibrary.loading);
 await page.getByRole('button',{name:'Play recording',exact:true}).click();
 await page.waitForFunction(() => !fileLibrary.isPaused);
 await page.getByRole('button',{name:'Pause recording',exact:true}).click();
 const volume = await page.evaluate(() => fileLibrary.media.volume);
 await page.evaluate(() => {
   window.originalMediaResume=fileLibrary.host.resume;
   window.mediaResumeGate=new Promise(resolve => {window.releaseMediaResume=resolve;});
   fileLibrary.host.resume=async () => {window.resumePending=true; await window.mediaResumeGate; await window.originalMediaResume();};
   window.mediaActions.get('play')({action:'play'});
   window.mediaActions.get('play')({action:'play'});
 });
 await page.waitForFunction(() => window.resumePending);
 expect(await page.evaluate(() => fileLibrary.wantPlay)).toBe(true);
 await page.evaluate(() => {window.mediaActions.get('pause')({action:'pause'});window.mediaActions.get('pause')({action:'pause'});window.releaseMediaResume();});
 await page.evaluate(() => fileLibrary.playTask);
 expect(await page.evaluate(() => ({want:fileLibrary.wantPlay,paused:fileLibrary.isPaused}))).toEqual({want:false,paused:true});
 await page.evaluate(() => {fileLibrary.host.resume=window.originalMediaResume;window.mediaActions.get('play')({action:'play'});window.mediaActions.get('play')({action:'play'});});
 await page.waitForFunction(() => !fileLibrary.isPaused);
 await page.evaluate(() => window.mediaActions.get('pause')({action:'pause'}));
 expect(await page.evaluate(() => fileLibrary.isPaused)).toBe(true);
 expect(await page.evaluate(() => fileLibrary.media.volume)).toBe(volume);
});
