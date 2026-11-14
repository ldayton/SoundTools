const {test,expect}=require('@playwright/test');
test('pitch numeric drafts commit, cancel and recover without drifting from presets',async({page})=>{
 await page.goto('/dist/index.html#settings');await page.getByRole('tab',{name:'Pitch',exact:true}).click();
 const minimum=page.getByLabel('Visible minimum (Hz)',{exact:true});
 await minimum.fill('');expect(await page.evaluate(()=>soundglowSession.featureState().pitch.minimum)).toBe(50);
 await minimum.fill('75');expect(await page.evaluate(()=>soundglowSession.featureState().pitch.minimum)).toBe(50);await minimum.press('Enter');expect(await page.evaluate(()=>soundglowSession.featureState().pitch.minimum)).toBe(75);await minimum.press('ArrowUp');expect(await page.evaluate(()=>soundglowSession.featureState().pitch.minimum)).toBe(80);await minimum.press('ArrowDown');expect(await page.evaluate(()=>soundglowSession.featureState().pitch.minimum)).toBe(75);
 await minimum.fill('80');await minimum.press('Escape');await expect(minimum).toHaveValue('75');await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','false');
 await minimum.fill('500');await minimum.press('Tab');await expect(page.locator('#pitchError')).toBeVisible();await expect(minimum).toHaveValue('75');
 await minimum.fill('');await page.locator('#pitchPreset').selectOption('praat');await expect(minimum).toHaveValue('50');await expect(page.locator('#pitchMaximum')).toHaveValue('800');
 const history=page.getByLabel('History (seconds)',{exact:true});await history.fill('7.5');await history.press('Tab');expect(await page.evaluate(()=>soundglowSession.featureState().pitch.history)).toBe(7.5);
 await history.fill('9');await page.locator('#pitchPreset').selectOption('soundglow');await expect(history).toHaveValue('10');
});
