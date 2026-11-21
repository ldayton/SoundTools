const {test,expect}=require('./fixtures.cjs');
const {expandSection}=require('./settings-input.cjs');
const path=require('node:path');
test('migrated controls fit desktop and mobile without changing the audio owner',async({page},info)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/dist/index.html');await page.locator('#demo').click();await page.waitForFunction(()=>running&&Number(canvas.dataset.plottedUntil)>3);await page.locator('#freeze').click();await page.evaluate(()=>window.acceptanceAudio=audio);
 const widths=info.project.name==='desktop'?[761,800,1680]:[360,390,600];
 for(const width of widths){await page.setViewportSize({width,height:info.project.name==='desktop'?1050:844});const toggle=page.locator('#openSettings:visible, #settings:visible');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('#settingsBody').evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);await expect(page.locator('#microphone')).toBeVisible();
  await page.getByRole('tab',{name:'Pitch',exact:true}).click();await expandSection(page,'advancedPitchTrace');await expect(page.locator('#pitchMethod')).toBeVisible();expect(await page.evaluate(()=>audio===acceptanceAudio&&paused)).toBe(true);await page.getByRole('tab',{name:'Spectrogram',exact:true}).click();
 }
 await page.setViewportSize({width:info.project.name==='desktop'?1680:390,height:info.project.name==='desktop'?1050:844});await page.locator('#settingsBody').evaluate(node=>node.scrollTop=0);await page.screenshot({path:info.project.name==='desktop'?'/tmp/soundglow-migrated-desktop.png':'/tmp/soundglow-migrated-mobile-settings.png'});
 if(info.project.name!=='desktop'){await page.locator('#settings').click();await page.screenshot({path:'/tmp/soundglow-migrated-mobile.png'})}
 expect(errors).toEqual([]);
});
test('saved-file selection and bookmark editor fit a desktop practice window',async({page},info)=>{
 test.skip(info.project.name!=='desktop','Saved files are desktop only');await page.setViewportSize({width:1680,height:1050});await page.goto('/dist/index.html');await page.locator('#audioFileInput').setInputFiles(path.resolve(__dirname,'../../dist/audio/alice-waters.m4a'));await page.waitForFunction(()=>fileLibrary.current&&!fileLibrary.loading);await page.waitForFunction(()=>filePreview?.history.frames.length>100&&!document.getElementById('fileAnalysisStatus').textContent);await page.locator('#openFiles').click();
 const wave=await page.locator('#fileWaveform').boundingBox();await page.mouse.move(wave.x+wave.width*.2,wave.y+30);await page.mouse.down();await page.mouse.move(wave.x+wave.width*.5,wave.y+30,{steps:5});await page.mouse.up();await page.locator('#bookmarkSelection').click();await expect(page.locator('#bookmarkName')).toBeFocused();await page.locator('#bookmarkName').fill('Practice passage');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'/tmp/soundglow-migrated-file.png'});await page.keyboard.press('Escape');await expect(page.locator('#bookmarkSelection')).toBeFocused();
});
