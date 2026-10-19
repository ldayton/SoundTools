const {test,expect}=require('@playwright/test');
const settings=async page=>page.locator(await page.locator('#openSettings').isVisible()?'#openSettings':'#settings').click();
test('pitch shares transport while feature settings and presets remain isolated',async({page},testInfo)=>{
 if(testInfo.project.name==='desktop')await page.setViewportSize({width:1280,height:900});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/dist/index.html');await page.locator('#demo').click();await page.waitForFunction(()=>Number(canvas.dataset.plottedUntil)>2);
 const identity=await page.evaluate(()=>{window.transportBefore={engine,audio,source,pcmNode};return settingsState.selected});
 await page.getByRole('tab',{name:'Pitch',exact:true}).click();await expect(page.locator('#pitchCanvas')).toBeVisible();await page.waitForFunction(()=>Number(document.getElementById('pitchCanvas').dataset.voiced)>20);
 await settings(page); // Same toolbar action on both layouts.
 await expect(page.locator('#pitchSettings')).toBeVisible();await expect(page.locator('#spectrogramSettings')).toBeHidden();
 await page.locator('#pitchHistory').fill('7');await page.locator('#pitchSmoothing').selectOption('off');
 await page.getByLabel('Band 3 name',{exact:true}).fill('My target');await page.getByLabel('Band 3 name',{exact:true}).dispatchEvent('change');
 expect(await page.evaluate(()=>settingsState.selected)).toBe(identity);
 expect(await page.evaluate(()=>Object.entries(transportBefore).every(([key,object])=>({engine,audio,source,pcmNode})[key]===object))).toBe(true);
 await page.getByRole('tab',{name:'Spectrogram',exact:true}).click();await expect(page.locator('#spectrogramSettings')).toBeVisible();await expect(page.locator('#pitchSettings')).toBeHidden();await expect(page.locator('#history')).toHaveValue('6');
 await page.getByRole('tab',{name:'Pitch',exact:true}).click();await expect(page.locator('#pitchHistory')).toHaveValue('7');await expect(page.getByLabel('Band 3 name',{exact:true})).toHaveValue('My target');
 await page.reload();await expect(page.getByRole('tab',{name:'Pitch',exact:true})).toHaveAttribute('aria-selected','true');
 if(!await page.locator('#pitchSettings').isVisible())await settings(page);await expect(page.locator('#pitchHistory')).toHaveValue('7');expect(errors).toEqual([]);
});
test('pitch pause, seek, reset and invalid bands preserve coherent state',async({page},testInfo)=>{
 if(testInfo.project.name==='desktop')await page.setViewportSize({width:1280,height:900});
 await page.goto('/dist/index.html');await page.locator('#demo').click();await page.waitForFunction(()=>Number(canvas.dataset.plottedUntil)>2);await page.locator('#freeze').click();await page.getByRole('tab',{name:'Pitch',exact:true}).click();await page.waitForFunction(()=>Number(document.getElementById('pitchCanvas').dataset.voiced)>20);
 const frozen=await page.locator('#pitchCanvas').getAttribute('data-plotted-until');
 await settings(page);await page.locator('#pitchMinimum').fill('500');await page.locator('#pitchMinimum').dispatchEvent('change');await expect(page.locator('#pitchError')).toBeVisible();await expect(page.locator('#pitchMinimum')).toHaveValue('50');
 await page.locator('#pitchSmoothing').selectOption('off');expect(await page.locator('#pitchCanvas').getAttribute('data-plotted-until')).toBe(frozen);
 await page.locator('#seek').fill('12');await page.locator('#seek').dispatchEvent('input');await page.locator('#freeze').click();await page.waitForFunction(()=>Number(document.getElementById('pitchCanvas').dataset.voiced)>20);await expect(page.locator('#notice')).toBeHidden();
});
test('pitch reset clears validation errors and chart text stays uncluttered',async({page},testInfo)=>{
 if(testInfo.project.name==='desktop')await page.setViewportSize({width:1280,height:900});
 await page.addInitScript(()=>{
  const fill=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,...args){
   if(this.canvas.id==='pitchCanvas'){window.pitchText??=new Set();window.pitchText.add(String(text));}
   return fill.call(this,text,...args);
  };
 });
 await page.goto('/dist/index.html');await page.getByRole('tab',{name:'Pitch',exact:true}).click();await page.locator('#demo').click();
 await page.waitForFunction(()=>Number(document.getElementById('pitchCanvas').dataset.voiced)>20);
 await settings(page);await page.locator('#pitchMinimum').fill('500');await page.locator('#pitchMinimum').dispatchEvent('change');
 await expect(page.locator('#pitchError')).toBeVisible();await page.locator('#resetPitch').click();
 await expect(page.locator('#pitchError')).toBeHidden();await expect(page.locator('#pitchMinimum')).toHaveValue('50');
 const text=await page.evaluate(()=>[...window.pitchText]);expect(text).toContain('Hz');expect(text).toContain('450');
 expect(text.some(t=>/Male|Female|Androgynous|\d+ Hz/.test(t))).toBe(false);
 await page.getByRole('tab',{name:'Spectrogram',exact:true}).click();
 if(testInfo.project.name!=='desktop')await expect(page.locator('#settings')).toHaveAttribute('aria-label','Return to spectrogram');
});
