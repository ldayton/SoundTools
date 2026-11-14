const {test,expect}=require('@playwright/test');
test('microphone failures are announced and welcome actions remain available for retry',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>Promise.reject(new DOMException('Denied','NotAllowedError')),enumerateDevices:async()=>[]}}));
 await page.goto('/dist/index.html');await page.locator('#begin').click();await expect(page.locator('#notice')).toContainText('Microphone access was denied');await expect(page.locator('#notice')).toHaveAttribute('role','status');await expect(page.locator('#state')).toHaveText('STOPPED');await expect(page.locator('#start')).toBeEnabled();await page.locator('#home').click();await expect(page.locator('#welcome')).toBeVisible();await expect(page.locator('#begin')).toBeEnabled();await expect(page.locator('#notice')).toBeHidden();
});
test('unavailable device storage disables file entry points while preserving microphone practice',async({page},info)=>{
 test.skip(info.project.name!=='desktop','Saved files are desktop only');await page.setViewportSize({width:1280,height:900});await page.addInitScript(()=>{Object.defineProperty(IDBFactory.prototype,'open',{configurable:true,value(){throw new DOMException('Denied','SecurityError')}})});
 await page.goto('/dist/index.html');await expect(page.locator('#openAudio')).toBeDisabled();await expect(page.locator('#begin')).toBeEnabled();await page.locator('#openFiles').click();await expect(page.locator('#importAudio')).toBeDisabled();await expect(page.locator('#audioLibraryStatus')).toContainText('Device storage is unavailable');
});
