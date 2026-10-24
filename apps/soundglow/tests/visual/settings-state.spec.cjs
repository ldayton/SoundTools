const {test,expect}=require('@playwright/test');
const consistent=async page=>expect(await page.evaluate(()=>assertSettingsConsistent())).toBe(true);
test('all registered controls agree with authoritative state across deterministic edit/apply sequences',async({page})=>{
 await page.goto('/dist/index.html#settings');
 for(const builtin of ['soundglow','praat','voice']){
  await page.locator('#preset').selectOption(builtin);await consistent(page);
  for(const id of ['advancedAnalysis','advancedColour'])if(await page.locator('#'+id).getAttribute('open')===null)await page.locator('#'+id+' > summary').click();
  // Every control is independently exercised through its real input event.
  const edits=await page.evaluate(()=>Array.from(document.querySelectorAll('#presetSettings select,#presetSettings input')).filter(el=>!el.disabled&&el.getClientRects().length).map(el=>({id:el.id,value:el.tagName==='SELECT'?Array.from(el.options).find(o=>o.value!==el.value)?.value:String(Number(el.value)===Number(el.min)?el.max:el.min),type:el.type})));
  for(const edit of edits){
   await page.locator('#preset').selectOption(builtin);
   if(edit.type==='select-one')await page.locator('#'+edit.id).selectOption(edit.value);else await page.locator('#'+edit.id).fill(edit.value);
   await expect(page.locator('#preset option:checked')).toHaveText('Unnamed Preset*');await consistent(page);
   expect(await page.evaluate(id=>settingsState.values[id],edit.id)).toBe(edit.value);
   await page.locator('#preset').selectOption(builtin);await consistent(page);
  }
 }
});
test('settings effects do not restart analysis for overlay and colour changes, and hand over DSP without resetting capture',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await page.goto('/dist/index.html#settings');
 await page.locator('#formants').selectOption('both');await page.locator('#demo').click();await page.waitForFunction(()=>Number(canvas.dataset.processedFrames)>100);
 if(await page.locator('#openSettings').getAttribute('aria-expanded')!=='true')await page.locator('#openSettings').click();
 await page.evaluate(()=>{window.settingsResets=0;window.requestedSettings=[];const original=engine.reset.bind(engine);engine.reset=()=>{window.settingsResets++;return original()};const analyse=engine.client.analyse.bind(engine.client);engine.client.analyse=(request,...args)=>{window.requestedSettings.push({windowSeconds:request.windowSeconds,timeStep:request.timeStep,analysisFlags:request.analysisFlags});return analyse(request,...args)}});
 await page.locator('#formantSmoothing').selectOption('strong');await page.locator('#formantFiltering').selectOption('off');await page.locator('#palette').selectOption('plasma');
 await consistent(page);expect(await page.evaluate(()=>settingsResets)).toBe(0);
 const frames=await page.evaluate(()=>processingStats.frames);await page.waitForFunction(n=>processingStats.frames>n+50,frames);
 if(await page.locator('#advancedAnalysis').getAttribute('open')===null)await page.locator('#advancedAnalysis > summary').click();await page.locator('#window').selectOption('0.015');expect(await page.evaluate(()=>settingsResets)).toBe(0);await page.waitForFunction(()=>window.requestedSettings.some(request=>request.windowSeconds===.015));expect(await page.evaluate(()=>requestedSettings.find(request=>request.windowSeconds===.015))).toEqual({windowSeconds:.015,timeStep:.005,analysisFlags:7});await consistent(page);
 await page.waitForFunction(()=>engine.activeSettings.windowSeconds===.015&&!engine.rebuild);
 await page.locator('#freeze').click();if(await page.locator('#openSettings').getAttribute('aria-expanded')!=='true')await page.locator('#openSettings').click();
 await page.locator('#preset').selectOption('soundglow');await consistent(page);await expect(page.locator('#formants')).toHaveValue('off');
 expect(await page.evaluate(()=>analysisFlags())).toBe(0);expect(await page.evaluate(()=>paused)).toBe(true);
 await page.setViewportSize({width:390,height:844});await consistent(page);await page.reload();await consistent(page);await expect(page.locator('#preset')).toHaveValue('soundglow');
});
test('editing a named custom preset keeps identity through save, rename, navigation and reload',async({page})=>{
 await page.goto('/dist/index.html#settings');await page.locator('#formants').selectOption('both');await page.locator('#editPresets').click();await page.locator('#presetName').fill('Sequence test');await page.locator('#confirmPresetName').click();
 const id=await page.locator('#preset').inputValue();await consistent(page);
 await page.locator('#formantSmoothing').selectOption('strong');await expect(page.locator('#preset')).toHaveValue(id);await consistent(page);
 await page.locator('#editPresets').click();await page.locator('#presetName').fill('Renamed sequence');await page.locator('#confirmPresetName').click();await consistent(page);
 await page.reload();await consistent(page);await expect(page.locator('#formants')).toHaveValue('both');await expect(page.locator('#formantSmoothing')).toHaveValue('strong');
 await page.locator('#settings').click();await page.locator('#settings').click();await page.goBack();await page.goForward();await consistent(page);
 await page.locator('#editPresets').click();await page.locator('#deletePreset').click();await expect(page.locator('#preset')).toHaveValue('soundglow');await expect(page.locator('#formants')).toHaveValue('off');await consistent(page);
});

test('stored numeric spellings normalize across state, controls, catalogue, edits and reload',async({page})=>{
 await page.goto('/dist/index.html');
 await page.evaluate(()=>{
  const settings={...SettingsState.defaults,gain:'1e1',history:' 6.0 ',compression:'0.30000000000000004',preemphasis:'0.0000005'};
  localStorage.setItem('soundglow-presets-v1',JSON.stringify({version:1,selected:'saved-numeric',presets:[{id:'saved-numeric',name:'Numeric test',settings}]}));
 });
 await page.goto('/dist/index.html#settings');await page.reload();await consistent(page);
 await expect(page.locator('#gain')).toHaveValue('10');await expect(page.locator('#compression')).toHaveValue('0.3');
 expect(await page.evaluate(()=>savedPresets[0].settings)).toEqual(await page.evaluate(()=>currentPresetSettings()));
 await page.locator('#gain').fill('11');await consistent(page);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('soundglow-presets-v1')).presets[0].settings)).toEqual(await page.evaluate(()=>currentPresetSettings()));
 await page.reload();await consistent(page);await expect(page.locator('#gain')).toHaveValue('11');
 // Apply/edit actions also normalize before rendering, not just storage loading.
 await page.evaluate(()=>updateSettings({type:'edit',id:'compression',value:'0.6000000000000001'}));
 await consistent(page);await expect(page.locator('#compression')).toHaveValue('0.6');
});
