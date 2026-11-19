const {test,expect}=require('@playwright/test');

test('React shell retains audio and canvas owners through navigation, disclosures and resize',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:1280,height:900});await page.goto('/dist/index.html');
 await page.locator('#demo').click();await page.waitForFunction(()=>Number(canvas.dataset.plottedUntil)>1);
 await page.locator('#freeze').click();
 await page.evaluate(()=>{window.shellOwners={engine,audio,source,pcmNode,canvas,visual:document.getElementById('visual'),settings:document.getElementById('settingsBody')};});
 await page.locator('#openSettings').click();await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','false');
 await page.locator('#settingsSectionToggle').click();await expect(page.locator('#settingsBody')).toBeHidden();
 await page.locator('#spectrogramTab').focus();await page.keyboard.press('ArrowRight');
 await expect(page.locator('#pitchTab')).toHaveAttribute('aria-selected','true');
 await page.locator('#settingsSectionToggle').click();await expect(page.locator('#pitchSettings')).toBeVisible();
 for(const width of [390,1280,390,1280]){
  await page.setViewportSize({width,height:844});
  await expect.poll(()=>page.locator('#visual').evaluate(el=>el.inert)).toBe(width<761);
  await expect(page.locator(width<761?'#headerActions #freeze':'#workspaceTransport #freeze')).toBeVisible();
  if(width<761){
   const keys=await page.evaluate(()=>{const a=document.getElementById('start').getBoundingClientRect(),b=document.getElementById('freeze').getBoundingClientRect(),header=document.querySelector('.soundglow-header');return {gap:b.left-a.right,overflow:header.scrollWidth>header.clientWidth};});
   expect(keys.gap).toBeGreaterThanOrEqual(6);expect(keys.overflow).toBe(false);
  }
 }
 expect(await page.evaluate(()=>Object.entries(shellOwners).every(([key,value])=>({engine,audio,source,pcmNode,canvas,visual:document.getElementById('visual'),settings:document.getElementById('settingsBody')})[key]===value))).toBe(true);
 await page.keyboard.press('Escape');await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','true');
 await page.locator('#freeze').click();await page.waitForFunction(()=>!paused&&Number(canvas.dataset.plottedUntil)>1.3);
 expect(errors).toEqual([]);
});

test('settings deep links, history and cached-page restoration keep controls usable',async({page})=>{
 await page.goto('/dist/index.html#settings');await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','false');
 await page.getByRole('tab',{name:'Pitch',exact:true}).click();
 await expect(page.locator('#pitchSettings')).toBeVisible();
 const toggle=page.locator('#openSettings:visible, #settings:visible');
 await toggle.click();await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','true');
 await toggle.click();await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','false');
 await page.goBack();await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','true');
 await page.goForward();await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','false');
 await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
 await page.locator('#settingsSectionToggle').click();await expect(page.locator('#settingsBody')).toBeHidden();
 await page.locator('#settingsSectionToggle').click();await expect(page.locator('#pitchSettings')).toBeVisible();
 await expect(page.getByRole('tablist',{name:'Views'})).toHaveCount(1);
 await expect(page.getByRole('main')).toHaveCount(1);
});


test('page exit stops audio while preserving controls for pending cleanup',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/dist/index.html');await page.locator('#demo').click();await page.waitForFunction(()=>running&&processingStats.frames>0);
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
 expect(await page.evaluate(()=>({running,audio:audio===null,engine:engine===null}))).toEqual({running:false,audio:true,engine:true});
 await expect(page.locator('#settings:visible, #openSettings:visible')).toBeVisible();
 await page.getByRole('tab',{name:'Pitch',exact:true}).click();await expect(page.locator('#pitchTab')).toHaveAttribute('aria-selected','true');expect(errors).toEqual([]);
});


test('render failure stops audio and shows reload recovery',async({page})=>{
 await page.goto('/dist/index.html');
 await page.locator('#demo').click();
 await page.waitForFunction(()=>running&&processingStats.frames>0);
 // An invalid child tests the actual boundary without a production crash hook.
 await page.evaluate(()=>window.SoundglowShell.feedback.publish({state:{invalid:true}}));
 await expect(page.getByRole('main',{name:'Soundglow recovery'})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>({running,audio:audio===null,engine:engine===null}))).toEqual({running:false,audio:true,engine:true});
 await page.evaluate(()=>startSpeech());
 expect(await page.evaluate(()=>running)).toBe(false);
 await page.getByRole('button',{name:'Reload app',exact:true}).click();
 await expect(page.locator('#demo')).toBeVisible();
 await expect(page.getByRole('main',{name:'Soundglow recovery'})).toHaveCount(0);
});


test('account close restores its opener but preserves a newer setting focus', async({page}) => {
 await page.goto('/dist/index.html#settings');
 const login = page.getByRole('button', { name:'Log in', exact:true });
 await login.click();
 const dialog = page.getByRole('dialog', { name:'Log in', exact:true });
 await dialog.getByRole('textbox', { name:'Email address', exact:true }).focus();
 await dialog.press('Escape');
 await expect(dialog).toBeHidden();
 await expect(login).toBeFocused();
 await login.click();
 await expect(dialog).toBeVisible();
 await dialog.press('Escape');
 const slider = page.locator('#floor-slider');
 await slider.focus();
 await expect(dialog).toBeHidden();
 await expect(slider).toBeFocused();
});
