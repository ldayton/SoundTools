const {test,expect}=require('@playwright/test');
test('Voice Tools and Praat presets switch during English playback',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/dist/index.html#settings');
 await expect(page.locator('#unnamedPreset')).toHaveAttribute('hidden','');await expect(page.locator('#savePresetForm')).toBeHidden();expect(await page.evaluate(()=>!document.getElementById('presetSettings').contains(document.getElementById('microphone'))&&!!(document.getElementById('microphone').compareDocumentPosition(document.getElementById('preset'))&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
 await expect(page.locator('#preset')).toHaveValue('praat');await page.locator('#preset').selectOption('voice');
 for(const [id,value] of Object.entries({maximum:'3500',scale:'voice',window:'0.025',preemphasis:'0',suppression:'10',colourLevels:'fixed'}))await expect(page.locator('#'+id)).toHaveValue(value);
 await expect(page.locator('#fixedMaximumControl')).toBeVisible();
 for(const f of [0,100,500,1000,3500])expect(await page.evaluate(f=>Math.abs(frequency(yFor(f)-padTop)-f),f)).toBeLessThan(1e-8);
 await page.getByRole('button',{name:'Return to spectrogram',exact:true}).click();await page.getByRole('button',{name:'Play an Example',exact:true}).click();
 await page.waitForFunction(()=>Number(canvas.dataset.plottedUntil)>6);
 expect(await page.evaluate(()=>displayMaximum)).toBe(100);
 expect(await page.evaluate(()=>processingStats.discontinuousBatches||0)).toBe(0);
 await page.screenshot({path:testInfo.outputPath('voice-tools.png')});
 const before=await page.evaluate(()=>({time:audio.currentTime,frames:processingStats.frames}));
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('#preset').selectOption('praat');
 for(const [id,value] of Object.entries({maximum:'5000',scale:'linear',history:'10',floor:'70',gain:'0',window:'0.005',preemphasis:'6',compression:'0',colourLevels:'auto',suppression:'0'}))await expect(page.locator('#'+id)).toHaveValue(value);
 await expect(page.locator('#fixedMaximumControl')).toBeHidden();
 await page.locator('#suppression').fill('5');await expect(page.locator('#preset')).toHaveValue('custom');await expect(page.locator('#preset option:checked')).toHaveText('Unnamed Preset*');await expect(page.locator('#unnamedPreset')).not.toHaveAttribute('hidden','');await page.locator('#preset').selectOption('praat');
 await page.getByRole('button',{name:'Return to spectrogram',exact:true}).click();
 await page.waitForFunction(before=>audio.currentTime>before.time&&processingStats.frames>before.frames+100,before);
 expect(await page.evaluate(()=>running&&!paused&&inputMode==='speech')).toBe(true);expect(errors).toEqual([]);
});

test('naming, renaming and deleting presets persist without a saved grouping or save button',async({page})=>{
 await page.goto('/dist/index.html#settings');await expect(page.locator('#preset optgroup')).toHaveCount(0);await expect(page.locator('#confirmPresetName')).toBeHidden();
 await page.locator('#floor').fill('45');await page.getByRole('button',{name:'Edit presets',exact:true}).click();await page.locator('#presetName').fill('Vowel focus*');await page.locator('#presetName').press('Enter');await expect(page.locator('#presetStatus')).toContainText('cannot include *');await expect(page.locator('#preset option[value^="saved-"]')).toHaveCount(0);
 await page.locator('#presetName').fill('Vowel focus');await page.getByRole('button',{name:'Create',exact:true}).click();const saved=await page.locator('#preset').inputValue();expect(saved).toMatch(/^saved-/);await expect(page.locator('#savePresetForm')).toBeHidden();
 await page.reload();await expect(page.locator('#preset')).toHaveValue(saved);await expect(page.locator('#floor')).toHaveValue('45');
 await page.getByRole('button',{name:'Edit presets',exact:true}).click();await page.locator('#presetName').fill('Voice Tools');await page.locator('#presetName').press('Enter');await expect(page.locator('#presetStatus')).toContainText('already in use');
 await page.locator('#presetName').fill('Vowel practice');await page.getByRole('button',{name:'Rename',exact:true}).click();await expect(page.locator('#preset option:checked')).toHaveText('Vowel practice');
 await page.reload();await expect(page.locator('#preset option:checked')).toHaveText('Vowel practice');await page.getByRole('button',{name:'Edit presets',exact:true}).click();await page.getByRole('button',{name:'Delete',exact:true}).click();await expect(page.locator('#preset option[value^="saved-"]')).toHaveCount(0);await expect(page.locator('#preset')).toHaveValue('praat');await expect(page.locator('#floor')).toHaveValue('70');await page.reload();await expect(page.locator('#preset')).toHaveValue('praat');await expect(page.locator('#preset option[value^="saved-"]')).toHaveCount(0);
});

test('failed local storage reports failure without claiming the preset was saved',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Storage full','QuotaExceededError')}});
 await page.goto('/dist/index.html#settings');await page.getByRole('button',{name:'Edit presets',exact:true}).click();await page.locator('#presetName').fill('My view');await page.locator('#presetName').press('Enter');await expect(page.locator('#presetStatus')).toContainText('Could not save');await expect(page.locator('#preset option[value^="saved-"]')).toHaveCount(0);await expect(page.locator('#presetName')).toHaveValue('My view');
});

test('renaming cannot take a built-in or another custom preset name',async({page})=>{
 await page.goto('/dist/index.html#settings');
 for(const [floor,name] of [['45','First view'],['50','Second view']]){
  await page.locator('#preset').selectOption('praat');
  await page.locator('#floor').fill(floor);await page.getByRole('button',{name:'Edit presets',exact:true}).click();await page.locator('#presetName').fill(name);await page.locator('#presetName').press('Enter');
 }
 const id=await page.locator('#preset').inputValue(),before=await page.evaluate(()=>localStorage.getItem('soundglow-presets-v1'));
 await page.getByRole('button',{name:'Edit presets',exact:true}).click();
 for(const name of ['Praat','  PRAAT  ','Voice Tools',' voice tools ','First view','  FIRST VIEW  ']){
  await page.locator('#presetName').fill(name);await page.locator('#presetName').press('Enter');await expect(page.locator('#presetStatus')).toContainText('already in use');await expect(page.locator('#preset')).toHaveValue(id);await expect(page.locator('#preset option:checked')).toHaveText('Second view');expect(await page.evaluate(()=>localStorage.getItem('soundglow-presets-v1'))).toBe(before);
 }
});


test('changing a named preset updates it in place, while built-ins remain immutable',async({page})=>{
 await page.goto('/dist/index.html#settings');await page.locator('#floor').fill('45');await page.getByRole('button',{name:'Edit presets',exact:true}).click();await page.locator('#presetName').fill('My voice');await page.locator('#presetName').press('Enter');const id=await page.locator('#preset').inputValue();
 await page.locator('#floor').fill('60');await page.locator('#gain').fill('3');await page.locator('#formants').selectOption('both');await expect(page.locator('#preset')).toHaveValue(id);await expect(page.locator('#preset option:checked')).toHaveText('My voice');await expect(page.locator('#preset option[value^="saved-"]')).toHaveCount(1);
 await page.reload();await expect(page.locator('#preset')).toHaveValue(id);await expect(page.locator('#floor')).toHaveValue('60');await expect(page.locator('#gain')).toHaveValue('3');await expect(page.locator('#formants')).toHaveValue('both');
 await page.locator('#preset').selectOption('praat');await page.locator('#floor').fill('45');await expect(page.locator('#preset option:checked')).toHaveText('Unnamed Preset*');await page.locator('#preset').selectOption('praat');await expect(page.locator('#floor')).toHaveValue('70');
 await page.locator('#preset').selectOption(id);await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError')}});await page.locator('#gain').fill('9');await expect(page.locator('#preset option:checked')).toHaveText('Unnamed Preset*');await expect(page.locator('#presetStatus')).toContainText('Could not save');await page.reload();await expect(page.locator('#gain')).toHaveValue('3');
});

test('preset dialog keeps settings still and supports cancel, Escape and focus return',async({page})=>{
 await page.goto('/dist/index.html');await page.getByRole('button',{name:'Settings',exact:true}).click();
 const before=await page.locator('#maximum').boundingBox();await page.getByRole('button',{name:'Edit presets',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('#presetName')).toBeFocused();
 const during=await page.locator('#maximum').boundingBox();expect(during.y).toBeCloseTo(before.y,1);
 await page.locator('#presetName').fill('Not saved');await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();await expect(page.locator('#preset option[value^="saved-"]')).toHaveCount(0);await expect(page.getByRole('button',{name:'Edit presets',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Edit presets',exact:true}).click();await page.locator('#presetName').press('Escape');await expect(page.getByRole('dialog')).toBeHidden();expect(new URL(page.url()).hash).toBe('#settings');
 await page.getByRole('button',{name:'Edit presets',exact:true}).click();await page.locator('#presetName').fill('My stable view');await page.getByRole('button',{name:'Create',exact:true}).click();const after=await page.locator('#maximum').boundingBox();expect(after.y).toBeCloseTo(before.y,1);
 await page.getByRole('button',{name:'Edit presets',exact:true}).click();await page.getByRole('button',{name:'Delete',exact:true}).click();const deleted=await page.locator('#maximum').boundingBox();expect(deleted.y).toBeCloseTo(before.y,1);
 await page.getByRole('button',{name:'Edit presets',exact:true}).click();await page.goBack();await expect(page.getByRole('dialog')).toBeHidden();
});


test('Settings heading stays fixed from the first pixel of scrolling',async({page})=>{
 await page.goto('/dist/index.html');await page.getByRole('button',{name:'Settings',exact:true}).click();const heading=page.getByRole('heading',{name:'Settings',exact:true}),before=await heading.boundingBox();const start=await page.locator('#microphone').boundingBox();
 for(const offset of [1,8,24,100,0]){await page.locator('#settingsBody').evaluate((el,y)=>{el.scrollTop=y},offset);const after=await heading.boundingBox();expect(after.y).toBeCloseTo(before.y,4);const input=await page.locator('#microphone').boundingBox();expect(input.y).toBeCloseTo(start.y-offset,1);}
});
