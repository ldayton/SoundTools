const {test,expect}=require('@playwright/test');
test('spectrogram preset modal retains failed input, retries once, and restores focus',async({page})=>{
 await page.goto('/dist/index.html#settings');await page.locator('#editPresets').click();await expect(page.getByRole('dialog',{name:'Name preset',exact:true})).toBeVisible();await expect(page.locator('#presetName')).toBeFocused();await page.locator('#presetName').fill('Retry preset');
 await page.evaluate(()=>{window.presetWrite=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError')}});
 await page.locator('#confirmPresetName').click();await expect(page.locator('#presetStatus')).toContainText('Could not save');await expect(page.locator('#presetName')).toHaveValue('Retry preset');await expect(page.locator('#presetDialog')).toBeVisible();
 await page.evaluate(()=>Storage.prototype.setItem=presetWrite);await page.locator('#confirmPresetName').click();await expect(page.locator('#presetDialog')).toBeHidden();await expect(page.locator('#preset option[value^="saved-"]')).toHaveCount(1);await expect(page.locator('#editPresets')).toBeFocused();
 await page.locator('#editPresets').click();await page.locator('#presetName').fill('Not committed');await page.keyboard.press('Escape');await expect(page.locator('#presetDialog')).toBeHidden();await expect(page.locator('#preset option:checked')).toHaveText('Retry preset');
 await page.locator('#editPresets').click();await expect(page.locator('#presetName')).toHaveValue('Retry preset');
});
test('browser Back closes a preset modal and focuses the settings opener',async({page})=>{
 await page.goto('/dist/index.html');await page.locator('#openSettings:visible, #settings:visible').click();await page.locator('#editPresets').click();await expect(page.locator('#presetDialog')).toBeVisible();await page.goBack();await expect(page.locator('#presetDialog')).toBeHidden();await expect(page.locator('#openSettings:visible, #settings:visible')).toBeFocused();
});
test('pitch preset storage failures retain draft and saved identity until retry',async({page})=>{
 await page.goto('/dist/index.html#settings');await page.getByRole('tab',{name:'Pitch',exact:true}).click();await page.locator('#editPitchPreset').click();await expect(page.getByRole('dialog',{name:'Name pitch preset',exact:true})).toBeVisible();await page.locator('#pitchPresetName').fill('Retry pitch');
 await page.evaluate(()=>{window.presetWrite=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError')}});
 await page.locator('#confirmPitchPresetName').click();await expect(page.locator('#pitchPresetStatus')).toContainText('Could not save');await expect(page.locator('#pitchPresetName')).toHaveValue('Retry pitch');await expect(page.locator('#pitchPreset option[value^="saved-"]')).toHaveCount(0);
 await page.evaluate(()=>Storage.prototype.setItem=presetWrite);await page.locator('#confirmPitchPresetName').click();await expect(page.locator('#pitchPresetDialog')).toBeHidden();await expect(page.locator('#pitchPreset option[value^="saved-"]')).toHaveCount(1);
 const id=await page.locator('#pitchPreset').inputValue();await page.locator('#editPitchPreset').click();await page.evaluate(()=>Storage.prototype.setItem=()=>{throw Error('full')});await page.locator('#deletePitchPreset').click();await expect(page.locator('#pitchPresetStatus')).toContainText('Could not save');await expect(page.locator('#pitchPreset')).toHaveValue(id);await expect(page.locator('#pitchPresetDialog')).toBeVisible();
 await page.evaluate(()=>Storage.prototype.setItem=presetWrite);await page.locator('#deletePitchPreset').click();await expect(page.locator('#pitchPresetDialog')).toBeHidden();await expect(page.locator('#pitchPreset')).toHaveValue('soundglow');await page.reload();await expect(page.locator('#pitchPreset option[value^="saved-"]')).toHaveCount(0);
});
test('a failed live pitch preset update stays usable without claiming to be saved',async({page})=>{
 const {setSetting}=require('./settings-input.cjs');await page.goto('/dist/index.html#settings');await page.getByRole('tab',{name:'Pitch',exact:true}).click();await page.locator('#editPitchPreset').click();await page.locator('#pitchPresetName').fill('Saved pitch');await page.locator('#confirmPitchPresetName').click();await expect(page.locator('#pitchPresetDialog')).toBeHidden();
 const id=await page.locator('#pitchPreset').inputValue();await page.evaluate(()=>Storage.prototype.setItem=()=>{throw Error('full')});await setSetting(page,'pitchHistory','8');await expect(page.locator('#pitchHistory')).toHaveValue('8');await expect(page.locator('#pitchPreset')).toHaveValue('custom');await expect(page.locator('#pitchPresetToast')).toContainText('Could not save');await page.reload();await expect(page.locator('#pitchPreset')).toHaveValue(id);await expect(page.locator('#pitchHistory')).toHaveValue('10');
});

test('finishing a closing preset dialog preserves focus moved to a setting', async({page}) => {
 await page.goto('/dist/index.html#settings');
 await page.getByRole('button',{name:'Edit presets',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toBeVisible();
 await dialog.press('Escape');
 const slider=page.locator('#floor-slider');
 await slider.focus();
 await expect(slider).toBeFocused();
 await expect(dialog).toBeHidden();
 await expect(slider).toBeFocused();
});
