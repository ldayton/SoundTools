const {test,expect}=require('@playwright/test');
test('formant controls apply actual tracking without clearing analysis or spectrogram pixels',async({page})=>{
 await page.goto('/dist/index.html#settings');
 await expect(page.locator('#formantSmoothing')).toHaveValue('light');await expect(page.locator('#formantFiltering')).toHaveValue('on');await expect(page.locator('#formants')).toHaveValue('off');
 await page.locator('#formants').selectOption('both');
 await page.evaluate(()=>{
  featureHistory=[.9,.91,.92].map((time,i)=>({time,formants:[500,i?1600:1500,2500],bandwidths:[80,100,120],pitch:i===2?0:180,strength:.9,intensity:75}));canvas.dataset.plottedUntil='1';
  const original=VoiceFeedback.FormantTracker;
  window.drawTracked=()=>{const outputs=[];VoiceFeedback.FormantTracker=class extends original{push(...args){const result=super.push(...args);outputs.push(result);return result}};try{drawAnalysis();return outputs}finally{VoiceFeedback.FormantTracker=original}};
  ctx.fillStyle='#123456';ctx.fillRect(0,0,1,1);
 });
 const light=await page.evaluate(()=>drawTracked());expect(light[1].formants[1].hz).toBeGreaterThan(1500);expect(light[1].formants[1].hz).toBeLessThan(1600);expect(light[2].formants[1].hz).toBeNull();
 await page.locator('#formantSmoothing').selectOption('strong');const strong=await page.evaluate(()=>drawTracked());expect(strong[1].formants[1].hz).toBeLessThan(light[1].formants[1].hz);
 await page.locator('#formantSmoothing').selectOption('off');expect((await page.evaluate(()=>drawTracked()))[1].formants[1].hz).toBeCloseTo(1600,8);
 await page.locator('#formantFiltering').selectOption('off');expect((await page.evaluate(()=>drawTracked()))[2].formants[1].hz).toBeCloseTo(1600,8);
 expect(await page.evaluate(()=>featureHistory.length)).toBe(3);expect(await page.evaluate(()=>Array.from(ctx.getImageData(0,0,1,1).data))).toEqual([18,52,86,255]);
 await expect(page.locator('#preset option:checked')).toHaveText('Unnamed Preset*');
 await page.locator('#editPresets').click();await page.locator('#presetName').fill('My formants');await page.locator('#confirmPresetName').click();await page.reload();
 await expect(page.locator('#preset option:checked')).toHaveText('My formants');await expect(page.locator('#formantSmoothing')).toHaveValue('off');await expect(page.locator('#formantFiltering')).toHaveValue('off');
});
test('paused speech and formant overlays survive desktop sidebar and mobile resizing',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await page.goto('/dist/index.html#settings');
 await page.locator('#formants').selectOption('both');await page.locator('#demo').click();await page.waitForFunction(()=>Number(document.querySelector('#spectrogram').dataset.processedFrames)>300);
 await page.locator('#freeze').click();
 async function coverage(){await page.waitForFunction(()=>{const c=document.querySelector('#spectrogram'),r=c.getBoundingClientRect();return c.width===Math.round(Math.round(r.width)*devicePixelRatio)&&c.height===Math.round(Math.round(r.height)*devicePixelRatio)});return page.evaluate(()=>{const canvas=document.querySelector('#spectrogram'),data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let coloured=0;for(let i=0;i<data.length;i+=4)if(data[i]>30)coloured++;return coloured/(canvas.width*canvas.height);});}
 const before=await coverage();expect(before).toBeGreaterThan(.001);
 await page.locator('#openSettings').click();const open=await coverage();expect(open).toBeGreaterThan(before*.7);expect(open).toBeLessThan(before*1.3);
 await page.locator('#formantSmoothing').selectOption('strong');await page.locator('#formantFiltering').selectOption('off');expect(await coverage()).toBe(open);
 await page.locator('#collapseSettings').click();expect(await coverage()).toBeGreaterThan(before*.7);
 await page.setViewportSize({width:390,height:844});expect(await coverage()).toBeGreaterThan(before*.7);
 await expect(page.locator('#state')).toHaveText('PAUSED');await page.locator('#freeze').click();await expect(page.locator('#state')).toHaveText('EXAMPLE');
});
test('selecting a built-in preset clears previously enabled formant markers and tracks',async({page})=>{
 await page.goto('/dist/index.html#settings');
 for(const builtin of ['soundglow','praat','voice']){
  await page.locator('#formants').selectOption('both');
  await page.evaluate(()=>{featureHistory=[{time:.9,formants:[500,1500,2500],bandwidths:[80,100,120],pitch:180,strength:.9,intensity:75}];canvas.dataset.plottedUntil='1';drawAnalysis();});
  expect(await page.evaluate(()=>analysisContext.getImageData(0,0,analysisCanvas.width,analysisCanvas.height).data.some((v,i)=>i%4===3&&v>0))).toBe(true);
  await page.locator('#preset').selectOption(builtin);await expect(page.locator('#formants')).toHaveValue('off');
  expect(await page.evaluate(()=>analysisFlags())).toBe(0);
  expect(await page.evaluate(()=>analysisContext.getImageData(0,0,analysisCanvas.width,analysisCanvas.height).data.some((v,i)=>i%4===3&&v>0))).toBe(false);
 }
});
