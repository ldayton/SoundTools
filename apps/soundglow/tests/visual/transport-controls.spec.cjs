const {test,expect}=require('@playwright/test');
const {setSetting}=require('./settings-input.cjs');
test('example controls preserve pause, seek, loop and listening independently of inspector navigation',async({page},info)=>{
 await page.goto('/dist/index.html');await page.locator('#demo').click();await page.waitForFunction(()=>running&&inputMode==='speech'&&processingStats.frames>50);await page.locator('#freeze').click();await expect(page.locator('#state')).toHaveText('PAUSED');
 await page.locator(await page.locator('#openSettings').isVisible()?'#openSettings':'#settings').click();await page.locator('#loop').uncheck();await page.locator('#listen').uncheck();expect(await page.evaluate(()=>({loop:speechNode.loop,gain:monitor.gain.value,paused}))).toEqual({loop:false,gain:0,paused:true});
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
