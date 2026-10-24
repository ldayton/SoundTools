const {test,expect}=require('@playwright/test');
const settings=async page=>page.locator(await page.locator('#openSettings').isVisible()?'#openSettings':'#settings').click();
test('navigation, shared controls, playback and feature settings have distinct scopes',async({page},info)=>{
 if(info.project.name==='desktop')await page.setViewportSize({width:1280,height:900});
 await page.goto('/dist/index.html#settings');
 expect(await page.locator('#featureTabs').evaluate(el=>el.parentElement.id)).toBe('app');
 for(const id of ['advancedAnalysis','advancedColour','developerSettings'])await expect(page.locator('#'+id)).not.toHaveAttribute('open','');
 await expect(page.locator('#testControls')).toBeHidden();
 expect(await page.locator('#microphone').evaluate(el=>!!el.closest('#presetSettings'))).toBe(false);
 await page.locator('#advancedAnalysis > summary').click();await expect(page.locator('#window')).toBeVisible();
 const scroll=await page.locator('#settingsBody').evaluate(el=>{el.scrollTop=200;return el.scrollTop});
 await page.getByRole('tab',{name:'Pitch',exact:true}).click();
 expect(await page.locator('#settingsBody').evaluate(el=>el.scrollTop)).toBe(0);
 await expect(page.locator('#pitchSettings')).toBeVisible();await expect(page.locator('#preset')).toBeHidden();
 await expect(page.getByLabel('Band 3 name',{exact:true})).toHaveCount(0);
 await page.getByRole('tab',{name:'Spectrogram',exact:true}).click();
 expect(await page.locator('#settingsBody').evaluate(el=>el.scrollTop)).toBe(scroll);
 await expect(page.locator('#advancedAnalysis')).toHaveAttribute('open','');
 await settings(page);await page.locator('#demo').click();await page.waitForFunction(()=>Number(canvas.dataset.plottedUntil)>1);
 await settings(page);await expect(page.locator('#testControls')).toBeVisible();await expect(page.locator('#microphoneScope')).toBeVisible();
 expect(await page.locator('#settingsBody').evaluate(el=>{const children=[...el.children].map(c=>c.id);return children.indexOf('testControls')<children.indexOf('spectrogramSettings')})).toBe(true);
 const engineBefore=await page.evaluate(()=>{window.beforeOrganizationSwitch={engine,audio,source};return Number(canvas.dataset.plottedUntil)});
 await page.getByRole('tab',{name:'Pitch',exact:true}).click();await expect(page.locator('#testControls')).toBeVisible();
 await page.waitForFunction(end=>Number(canvas.dataset.plottedUntil)>end+.2,engineBefore);
 expect(await page.evaluate(()=>Object.entries(beforeOrganizationSwitch).every(([key,value])=>({engine,audio,source})[key]===value))).toBe(true);
});
test('starting the example preserves desktop settings and returns mobile users to the chart',async({page},info)=>{
 const desktop=info.project.name==='desktop';if(desktop)await page.setViewportSize({width:1280,height:900});
 await page.goto('/dist/index.html#settings');
 await page.locator('#advancedAnalysis > summary').click();
 await page.getByRole('tab',{name:'Pitch',exact:true}).click();
 // The homepage example button is available beside the desktop sidebar.
 if(!desktop){
  await page.evaluate(()=>startSpeech());
 }else await page.locator('#demo').click();
 await expect(page.locator('#state')).toHaveText('EXAMPLE');
 await page.waitForFunction(()=>Number(document.getElementById('pitchCanvas').dataset.voiced)>20);
 if(desktop){
  await expect(page).toHaveURL(/#settings$/);await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','false');
  await expect(page.locator('#pitchSettings')).toBeVisible();await expect(page.locator('#testControls')).toBeVisible();await expect(page.locator('#microphoneScope')).toBeVisible();
  await page.getByRole('tab',{name:'Spectrogram',exact:true}).click();await expect(page.locator('#advancedAnalysis')).toHaveAttribute('open','');
 }else {await expect(page).not.toHaveURL(/#settings$/);await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','true');}
});
test('pause and resume respect desktop inspector and mobile page navigation',async({page},info)=>{
 const desktop=info.project.name==='desktop';if(desktop)await page.setViewportSize({width:1280,height:900});
 await page.goto('/dist/index.html');await page.locator('#demo').click();await page.waitForFunction(()=>Number(canvas.dataset.plottedUntil)>1);
 for(const state of ['PAUSED','EXAMPLE']){
  if(await page.locator('#settings').getAttribute('aria-expanded')!=='true')await settings(page);
  await page.locator('#freeze').click();await expect(page.locator('#state')).toHaveText(state);
  await expect(page.locator('#panel')).toHaveAttribute('aria-hidden',String(!desktop));
 }
 if(desktop){
  await page.locator('#openSettings').press('Space');await expect(page.locator('#state')).toHaveText('PAUSED');await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','false');
  await page.locator('#openSettings').press('Space');await expect(page.locator('#state')).toHaveText('EXAMPLE');await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','false');
 }
 // Closed desktop settings also stay closed; controls never toggle the sidebar.
 if(desktop)await settings(page);
 await page.locator('#freeze').click();await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','true');
});
test('microphone start and stop preserve desktop inspector visibility',async({playwright},info)=>{
 const desktop=info.project.name==='desktop';
 const browser=await playwright.chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 try{
  const context=await browser.newContext({permissions:['microphone'],viewport:desktop?{width:1280,height:900}:{width:390,height:844}});const page=await context.newPage();
  await page.goto('http://127.0.0.1:8779/dist/index.html#settings');
  await page.locator('#start').click();await expect(page.locator('#state')).toHaveText('LIVE');
  await expect(page.locator('#panel')).toHaveAttribute('aria-hidden',String(!desktop));
  if(!desktop)await settings(page);
  await page.locator('#start').click();await expect(page.locator('#state')).toHaveText('STOPPED');
  await expect(page.locator('#panel')).toHaveAttribute('aria-hidden',String(!desktop));
  if(desktop){await page.locator('#start').click();await expect(page.locator('#state')).toHaveText('LIVE');await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','false');}
 }finally{await browser.close()}
});
