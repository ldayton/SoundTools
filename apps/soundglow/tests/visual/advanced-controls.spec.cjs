const {test,expect}=require('./fixtures.cjs');
test('advanced analysis has ordinary keyboard disclosure behavior and stays synchronized while closed',async({page})=>{
 await page.goto('/dist/index.html');await page.locator('#demo').click();await page.waitForFunction(()=>running&&processingStats.frames>100);
 await page.locator('#openSettings:visible, #settings:visible').click();
 const disclosure=page.getByRole('button',{name:'Advanced analysis',exact:true});await expect(disclosure).toHaveAttribute('aria-expanded','false');
 await disclosure.press('Space');await expect(disclosure).toHaveAttribute('aria-expanded','true');expect(await page.evaluate(()=>running&&!paused)).toBe(true);
 await page.locator('#resampling').selectOption('polyphase');await expect(page.locator('#resampleQuality')).toBeEnabled();await page.locator('#resampleQuality').selectOption('4');
 await disclosure.press('Enter');await expect(disclosure).toHaveAttribute('aria-expanded','false');
 await page.locator('#preset').selectOption('soundglow');await expect(page.locator('#resampling')).toHaveValue('praat');await expect(page.locator('#resampleQuality')).toHaveValue('2');await expect(page.locator('#resampleQuality')).toBeDisabled();
 expect(await page.evaluate(()=>assertSettingsConsistent())).toBe(true);
 await disclosure.press('Enter');await page.getByRole('tab',{name:'Pitch',exact:true}).click();await page.getByRole('tab',{name:'Spectrogram',exact:true}).click();await expect(disclosure).toHaveAttribute('aria-expanded','true');
});
