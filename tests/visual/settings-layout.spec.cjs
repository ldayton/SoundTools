const {test,expect}=require('@playwright/test');
test('desktop sidebar starts collapsed, toggles left, and leaves the spectrogram usable',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await page.goto('/dist/index.html');
 await expect(page.locator('#settings')).toBeHidden();await expect(page.locator('#openSettings')).toBeVisible();await expect(page.locator('#workspaceTransport #start')).toBeVisible();await expect(page.locator('#workspaceTransport #freeze')).toBeVisible();await expect(page.locator('#headerActions #start')).toHaveCount(0);await expect(page.locator('#openSettings')).toHaveAttribute('aria-expanded','false');
 await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','true');
 expect(await page.locator('#visual').evaluate(el=>el.getBoundingClientRect().width)).toBe(1280);
 await page.locator('#openSettings').click();await expect(page).toHaveURL(/#settings$/);
 await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','false');
 const boxes=await page.evaluate(()=>({panel:document.querySelector('#panel').getBoundingClientRect().toJSON(),visual:document.querySelector('#visual').getBoundingClientRect().toJSON(),inert:document.querySelector('#visual').inert}));
 expect(boxes.panel.x).toBe(0);expect(boxes.panel.width).toBe(300);expect(boxes.visual.x).toBe(300);expect(boxes.visual.width).toBe(980);expect(boxes.inert).toBe(false);
 await expect(page.locator('#begin')).toBeVisible();await page.locator('#preset').selectOption('voice');await expect(page.locator('#maximum')).toHaveValue('4000');
 const heading=await page.locator('.panelhead').boundingBox();await page.locator('#settingsBody').evaluate(el=>el.scrollTop=200);expect((await page.locator('.panelhead').boundingBox()).y).toBe(heading.y);
 await page.locator('#collapseSettings').click();await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','true');
 await expect(page.locator('#openSettings')).toBeFocused();expect(await page.locator('#panel').evaluate(el=>el.inert)).toBe(true);expect(await page.locator('#visual').evaluate(el=>el.getBoundingClientRect().width)).toBe(1280);
 await page.goForward();await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','false');
 await page.keyboard.press('Escape');await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','true');
});
test('resizing preserves mobile settings navigation and desktop access to both panes',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/dist/index.html');
 await expect(page.locator('#settings')).toBeVisible();await expect(page.locator('#workspaceToolbar')).toBeHidden();await expect(page.locator('#headerActions #start')).toBeVisible();await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','true');
 await page.locator('#settings').click();await expect(page).toHaveURL(/#settings$/);await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','false');
 expect(await page.locator('#visual').evaluate(el=>el.inert)).toBe(true);
 await page.setViewportSize({width:1280,height:900});await expect.poll(()=>page.locator('#visual').evaluate(el=>el.inert)).toBe(false);
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.locator('#visual').evaluate(el=>el.inert)).toBe(true);
 await page.locator('#settings').click();await expect(page.locator('#panel')).toHaveAttribute('aria-hidden','true');await expect(page.locator('#begin')).toBeVisible();
});
