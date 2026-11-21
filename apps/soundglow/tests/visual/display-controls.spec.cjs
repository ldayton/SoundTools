const {test,expect}=require('./fixtures.cjs');
const {setHistory}=require('./settings-input.cjs');

test('React display controls follow presets, keyboard edits and saved values',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/dist/index.html#settings');
 const display=page.locator('#spectrogramDisplay'),history=display.getByRole('slider',{name:'History',exact:true});
 for(const id of ['maximum','scale'])expect(await display.locator('#'+id+' option').evaluateAll(options=>options.map(o=>o.value))).toEqual(await page.evaluate(id=>SettingsState.registry[id].values,id));
 await display.getByLabel('Frequency ceiling',{exact:true}).selectOption('3500');await display.getByLabel('Frequency scale',{exact:true}).selectOption('log');
 expect(await page.evaluate(()=>({maximum:setting('maximum'),scale:setting('scale'),consistent:assertSettingsConsistent()}))).toEqual({maximum:'3500',scale:'log',consistent:true});
 await setHistory(page,30);await expect(history).toHaveAttribute('aria-valuenow','30');await expect(history).toHaveAttribute('aria-valuetext','30 seconds');
 await history.press('ArrowRight');await expect(history).toHaveAttribute('aria-valuenow','30');
 await setHistory(page,3);await history.press('ArrowLeft');await expect(history).toHaveAttribute('aria-valuenow','3');
 await history.press('ArrowRight');await expect(page.locator('#historyOut')).toHaveText('4 s');await expect(page.locator('#history')).toHaveValue('4');
 await page.locator('#editPresets').click();await page.locator('#presetName').fill('React display');await page.locator('#confirmPresetName').click();
 const saved=await page.locator('#preset').inputValue();await page.reload();
 await expect(page.locator('#preset')).toHaveValue(saved);await expect(history).toHaveAttribute('aria-valuenow','4');await expect(display.getByLabel('Frequency ceiling',{exact:true})).toHaveValue('3500');
 await page.locator('#preset').selectOption('praat');await expect(history).toHaveAttribute('aria-valuenow','10');await expect(display.getByLabel('Frequency scale',{exact:true})).toHaveValue('linear');
 await page.locator('#preset').selectOption(saved);await expect(history).toHaveAttribute('aria-valuenow','4');expect(await page.evaluate(()=>assertSettingsConsistent())).toBe(true);expect(errors).toEqual([]);
});

test('slider pointer and single-step edits keep the controller authoritative',async({page})=>{
 await page.goto('/dist/index.html#settings');
 const slider=page.getByRole('slider',{name:'History',exact:true});
 await page.evaluate(()=>{window.historyEdits=0;const update=updateSettings;updateSettings=event=>{if(event.type==='edit'&&event.id==='history')historyEdits++;return update(event)};});
 await slider.press('ArrowRight');expect(await page.evaluate(()=>historyEdits)).toBe(1);
 await slider.scrollIntoViewIfNeeded();await slider.hover();await expect(slider).toBeInViewport({ratio:1});
 const root=await page.locator('#spectrogramDisplay .mantine-Slider-root').boundingBox(),thumb=await slider.boundingBox();
 await page.mouse.move(thumb.x+thumb.width/2,thumb.y+thumb.height/2);await page.mouse.down();await page.mouse.move(root.x+root.width*.75,thumb.y+thumb.height/2,{steps:6});await page.mouse.up();
 // Mantine coalesces pointer moves on animation frames; wait for the rendered edit.
 await expect.poll(async()=>Number(await slider.getAttribute('aria-valuenow'))).toBeGreaterThan(15);
 const value=Number(await slider.getAttribute('aria-valuenow'));expect(value).toBeLessThan(30);
 expect(await page.evaluate(()=>assertSettingsConsistent())).toBe(true);
 const before=await page.locator('#history').inputValue();await page.evaluate(()=>updateSettings({type:'edit',id:'history',value:'999'}));
 await expect(page.locator('#history')).toHaveValue(before);await expect(slider).toHaveAttribute('aria-valuenow',before);expect(await page.evaluate(()=>assertSettingsConsistent())).toBe(true);
 await page.locator('#preset').selectOption('soundglow');await expect(slider).toHaveAttribute('aria-valuenow','6');
});


test('display edits preserve the live source and slider Space does not pause audio',async({page})=>{
 await page.goto('/dist/index.html');await page.locator('#demo').click();await page.waitForFunction(()=>running&&processingStats.frames>100);
 await page.locator('#openSettings:visible, #settings:visible').click();
 await page.evaluate(()=>{window.displayOwners={engine,audio,source,generation:engine.generation};});
 const slider=page.getByRole('slider',{name:'History',exact:true});await slider.press('Space');
 expect(await page.evaluate(()=>running&&!paused)).toBe(true);await slider.press('ArrowRight');await page.locator('#scale').selectOption('linear');
 expect(await page.evaluate(()=>engine.generation===displayOwners.generation)).toBe(true);
 await page.locator('#maximum').selectOption('3500');await page.waitForFunction(()=>engine.activeSettings.maximumFrequency===3500&&!engine.rebuild);
 expect(await page.evaluate(()=>engine===displayOwners.engine&&audio===displayOwners.audio&&source===displayOwners.source&&running&&!paused&&assertSettingsConsistent())).toBe(true);
});
