const {test,expect}=require('@playwright/test');
test('spectrogram preset modal retains failed input, retries once, and restores focus',async({page})=>{
 await page.goto('/dist/index.html#settings');await page.locator('#editPresets').click();await expect(page.locator('#presetName')).toBeFocused();await page.locator('#presetName').fill('Retry preset');
 await page.evaluate(()=>{window.presetWrite=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError')}});
 await page.locator('#confirmPresetName').click();await expect(page.locator('#presetStatus')).toContainText('Could not save');await expect(page.locator('#presetName')).toHaveValue('Retry preset');await expect(page.locator('#presetDialog')).toBeVisible();
 await page.evaluate(()=>Storage.prototype.setItem=presetWrite);await page.locator('#confirmPresetName').click();await expect(page.locator('#presetDialog')).toBeHidden();await expect(page.locator('#preset option[value^="saved-"]')).toHaveCount(1);await expect(page.locator('#editPresets')).toBeFocused();
 await page.locator('#editPresets').click();await page.locator('#presetName').fill('Not committed');await page.keyboard.press('Escape');await expect(page.locator('#presetDialog')).toBeHidden();await expect(page.locator('#preset option:checked')).toHaveText('Retry preset');
 await page.locator('#editPresets').click();await expect(page.locator('#presetName')).toHaveValue('Retry preset');
});
test('browser Back closes a preset modal and focuses the settings opener',async({page})=>{
 await page.goto('/dist/index.html');await page.locator('#openSettings:visible, #settings:visible').click();await page.locator('#editPresets').click();await expect(page.locator('#presetDialog')).toBeVisible();await page.goBack();await expect(page.locator('#presetDialog')).toBeHidden();await expect(page.locator('#openSettings:visible, #settings:visible')).toBeFocused();
});
