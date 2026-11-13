const {test,expect}=require('@playwright/test');
const path=require('node:path');
test.beforeEach(async({page},info)=>{if(info.project.name==='desktop')await page.setViewportSize({width:1280,height:900});});
const desktopTest=(name,fn)=>test(name,async({page},info)=>{test.skip(info.project.name!=='desktop','Saved-file browsing is desktop only');await fn({page},info);});
const fixture=path.resolve(__dirname,'../../dist/audio/alice-waters.m4a');
async function showPlayer(page){if(await page.locator('#stage').evaluate(el=>el.classList.contains('settings-open')&&innerWidth<761))await page.locator('#settings').click();}
async function open(page){await page.goto('/dist/index.html');await page.evaluate(()=>fileLibrary.ready);}
async function importAudio(page,name){await page.locator('#audioFileInput').setInputFiles(name||fixture);await expect(page.locator('#audioFileList button')).toHaveCount(1);await expect(page.locator('#filePlay')).toBeEnabled();await page.waitForFunction(()=>fileLibrary.current&&!fileLibrary.loading);}
desktopTest('Files and Settings disclose independently without closing the sidebar',async({page})=>{
 await open(page);await page.locator('#openFiles').click();
 await expect(page.locator('#stage')).toHaveClass(/settings-open/);
 for(const [button,body] of [['toggleFiles','filesBody'],['settingsSectionToggle','settingsBody']]){
  await page.locator('#'+button).click();await expect(page.locator('#'+body)).toBeHidden();await expect(page.locator('#stage')).toHaveClass(/settings-open/);
  await page.locator('#'+button).click();await expect(page.locator('#'+body)).toBeVisible();await expect(page.locator('#stage')).toHaveClass(/settings-open/);
 }
});
desktopTest('saved audio restores paused, plays and seeks, survives switching, and deletes',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await importAudio(page);
 await page.reload();await page.evaluate(()=>fileLibrary.ready);await expect(page.locator('#fileTransport')).toBeVisible();
 expect(await page.evaluate(()=>fileLibrary.isPaused)).toBe(true);
 await page.locator('#filePlay').click();await page.waitForFunction(()=>fileLibrary.position>1&&filePreview.history.frames.length>0);
 await page.locator('#filePlay').click();expect(await page.evaluate(()=>fileLibrary.isPaused)).toBe(true);
 await page.locator('#fileForward').click();const position=await page.evaluate(()=>fileLibrary.position);expect(position).toBeGreaterThan(5);
 await page.evaluate(()=>fileLibrary.pendingSave);await page.reload();await page.evaluate(()=>fileLibrary.ready);expect(await page.evaluate(()=>fileLibrary.position)).toBeCloseTo(position,1);expect(await page.evaluate(()=>fileLibrary.isPaused)).toBe(true);await expect(page.locator('#audioLibraryStatus')).not.toHaveText(/Could not save/);
 await page.locator('#filePlay').click();await page.waitForFunction(()=>!fileLibrary.isPaused);await page.locator('#filePlay').click();
 await page.locator('#fileRestart').click();expect(await page.evaluate(()=>fileLibrary.position)).toBe(0);
 await page.locator('.file-more summary').click();await page.locator('#fileSpeed').selectOption('0.75');await page.locator('#fileVolume').evaluate(el=>{el.value='.4';el.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(await page.evaluate(()=>fileLibrary.media.playbackRate)).toBe(.75);
 await page.locator('#audioFileInput').setInputFiles(fixture);await expect(page.locator('#audioFileList button')).toHaveCount(2);
 await page.locator('#openFiles').click();await page.locator('#audioFileList button').nth(1).click();await page.waitForFunction(()=>!fileLibrary.loading);await showPlayer(page);
 await page.locator('#filePlay').click();await page.waitForFunction(()=>!fileLibrary.isPaused&&filePreview.history.frames.length>0);await page.locator('#filePlay').click();
 if(await page.locator('#stage').evaluate(el=>!el.classList.contains('settings-open')))await page.locator('#openFiles').click();
 await page.locator('#removeAudio').click();await expect(page.locator('#audioFileList button')).toHaveCount(1);
 await page.locator('#removeAudio').click();await expect(page.locator('#audioFileList button')).toHaveCount(0);await expect(page.locator('#fileTransport')).toBeHidden();
 await page.reload();await page.evaluate(()=>fileLibrary.ready);await expect(page.locator('#audioFileList button')).toHaveCount(0);expect(errors).toEqual([]);
});
desktopTest('rapid play, pause, and file changes do not leave playback stuck',async({page})=>{
 await open(page);await importAudio(page);await page.evaluate(async()=>{const first=fileLibrary.play();fileLibrary.pause();await first;});
 expect(await page.evaluate(()=>fileLibrary.isPaused)).toBe(true);
 await page.locator('#filePlay').click();await page.waitForFunction(()=>!fileLibrary.isPaused);
 await page.locator('#audioFileInput').setInputFiles(fixture);await expect(page.locator('#audioFileList button')).toHaveCount(2);
 await page.evaluate(async()=>{const pending=fileLibrary.play();await fileLibrary.select(fileLibrary.files[1].id);await pending;});
 await page.locator('#filePlay').click();await page.waitForFunction(()=>!fileLibrary.isPaused&&filePreview.history.frames.length>0);
});

desktopTest('invalid files leave no library entries and passage loops keep their bounds',async({page})=>{
 await open(page);await page.locator('#audioFileInput').setInputFiles({name:'broken.wav',mimeType:'audio/wav',buffer:Buffer.from('not audio')});
 await expect(page.locator('#audioLibraryStatus')).toHaveText(/cannot read|no readable/);await expect(page.locator('#audioFileList button')).toHaveCount(0);
 await importAudio(page);await page.locator('.file-more summary').click();await page.locator('#fileLoopEnd').fill('1');await page.locator('#fileLoopEnd').press('Tab');
 await expect(page.locator('#fileLoop')).not.toBeChecked();await page.locator('#fileLoop').check();await page.locator('#filePlay').click();await page.waitForFunction(()=>!fileLibrary.isPaused&&fileLibrary.position>.3);
 await page.waitForTimeout(1600);expect(await page.evaluate(()=>fileLibrary.position)).toBeLessThan(1.3);expect(await page.evaluate(()=>fileLibrary.isPaused)).toBe(false);
 await page.locator('#filePlay').click();await page.locator('#clearAudioSelection').click();await expect(page.locator('#fileLoop')).not.toBeChecked();
 await page.context().setOffline(true);expect(await page.evaluate(async()=> (await fileLibrary.store.get(fileLibrary.current.id)).size)).toBeGreaterThan(0);
});

desktopTest('waveform zoom and pan allow precise passage selection without changing playback',async({page})=>{
 await open(page);await importAudio(page);
 const duration=await page.evaluate(()=>fileLibrary.current.duration);
 await page.locator('#waveformShowAll').click();await expect(page.locator('#waveformZoomOut')).toBeDisabled();
 await page.locator('#waveformZoomIn').click();await page.locator('#waveformZoomIn').click();
 expect(await page.evaluate(()=>fileLibrary.viewSpan)).toBeCloseTo(duration/4,5);
 expect(await page.evaluate(()=>fileLibrary.position)).toBe(0);
 await page.evaluate(()=>fileLibrary.setView(10,fileLibrary.viewSpan));
 const box=await page.locator('#fileWaveform').boundingBox();
 await page.mouse.move(box.x+box.width*.2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.3,box.y+box.height/2,{steps:10});await page.mouse.up();
 const selected=await page.evaluate(()=>({...fileLibrary.loop,paused:fileLibrary.isPaused}));
 expect(selected.start).toBeCloseTo(10+duration/4*.2,1);expect(selected.end).toBeCloseTo(10+duration/4*.3,1);expect(selected.paused).toBe(true);
 await page.waitForFunction(()=>fileLibrary.peaks?.length===fileLibrary.waveformResolution());
 await page.screenshot({path:`/tmp/soundglow-waveform-zoom-${page.viewportSize().width}.png`});
 await page.locator('#waveformZoomOut').click();expect(await page.evaluate(()=>fileLibrary.loop.start)).toBeCloseTo(selected.start,5);
 await page.locator('#waveformShowAll').click();expect(await page.evaluate(()=>fileLibrary.viewStart)).toBe(0);expect(await page.evaluate(()=>fileLibrary.viewSpan)).toBe(duration);
 for(let i=0;i<20;i++) { if(await page.locator('#waveformZoomIn').isEnabled())await page.locator('#waveformZoomIn').click(); }
 await expect(page.locator('#waveformZoomIn')).toBeDisabled();expect(await page.evaluate(()=>fileLibrary.viewSpan)).toBe(.001);
 await page.evaluate(()=>fileLibrary.setView(fileLibrary.current.duration-fileLibrary.viewSpan,fileLibrary.viewSpan));
 expect(await page.evaluate(()=>fileLibrary.viewStart+fileLibrary.viewSpan)).toBeCloseTo(duration,5);
 await page.locator('#fileForward').click();expect(await page.evaluate(()=>fileLibrary.viewStart+fileLibrary.viewSpan)).toBeCloseTo(duration,5);
 await page.locator('#waveformShowAll').click();await page.locator('#audioFileInput').setInputFiles(fixture);await expect(page.locator('#audioFileList button')).toHaveCount(2);
 await page.evaluate(()=>fileLibrary.select(fileLibrary.files[1].id));
 expect(await page.evaluate(()=>fileLibrary.viewSpan)).toBe(10);expect(await page.evaluate(()=>fileLibrary.loop)).toBeNull();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

desktopTest('overview controls linked analysis of unplayed audio, selections and explicit looping',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await open(page);await importAudio(page);
 await page.waitForFunction(()=>Number(canvas.dataset.fileFrames)>0);expect(await page.evaluate(()=>filePreview.features.length)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>fileLibrary.position)).toBe(0);expect(await page.evaluate(()=>fileLibrary.isPaused)).toBe(true);
 const nav=await page.locator('#fileOverview').boundingBox(),duration=await page.evaluate(()=>fileLibrary.current.duration);
 // Choose a viewing window outside the initial ten seconds.
 await page.mouse.move(nav.x+nav.width*20/duration,nav.y+18);await page.mouse.down();await page.mouse.move(nav.x+nav.width*24/duration,nav.y+18,{steps:10});await page.mouse.up();
 await page.waitForFunction(()=>Number(canvas.dataset.fileFrames)>0);
 expect(await page.evaluate(()=>filePreview.start)).toBeCloseTo(20,1);expect(await page.evaluate(()=>filePreview.end)).toBeCloseTo(24,1);
 const firstFrame=await page.evaluate(()=>({time:filePreview.history.frames[0].time,start:filePreview.start}));expect(firstFrame.time).toBeGreaterThanOrEqual(firstFrame.start-1e-6);expect(firstFrame.time-firstFrame.start).toBeLessThan(.1);
 expect(await page.evaluate(()=>fileLibrary.position)).toBe(0);
 const detail=await page.locator('#fileWaveform').boundingBox();
 await page.mouse.move(detail.x+detail.width*.25,detail.y+20);await page.mouse.down();await page.mouse.move(detail.x+detail.width*.5,detail.y+20,{steps:8});await page.mouse.up();
 await expect(page.locator('#fileLoop')).not.toBeChecked();await page.locator('#waveformFitSelection').click();
 await page.waitForFunction(()=>Number(canvas.dataset.fileFrames)>0);
 expect(await page.evaluate(()=>filePreview.start)).toBeCloseTo(21,1);expect(await page.evaluate(()=>filePreview.end)).toBeCloseTo(22,1);
 await page.locator('#pitchTab').click();await page.waitForFunction(()=>Number(document.getElementById('pitchCanvas').dataset.voiced)>0);
 expect(Number(await page.locator('#pitchCanvas').getAttribute('data-file-start'))).toBeCloseTo(21,1);
 const bounds=await page.evaluate(()=>{const p=document.getElementById('pitchCanvas').getBoundingClientRect(),d=document.getElementById('fileWaveform').getBoundingClientRect();return {chartLeft:p.left+48,waveLeft:d.left,chartRight:p.right-15,waveRight:d.right};});
 expect(bounds.waveLeft).toBeCloseTo(bounds.chartLeft,0);expect(bounds.waveRight).toBeCloseTo(bounds.chartRight,0);
 await page.screenshot({path:'/tmp/soundglow-linked-desktop.png'});
 await page.locator('#fileLoop').check();await page.locator('#filePlay').click();await page.waitForFunction(()=>!fileLibrary.isPaused);
 await page.locator('#filePlay').click();expect(await page.evaluate(()=>filePreview.start)).toBeCloseTo(21,1);
 await page.locator('#fileLoop').uncheck();await page.locator('#filePlay').click();await page.waitForFunction(()=>fileLibrary.isPaused&&fileLibrary.position>=fileLibrary.loop.end-.01);
 const before=await page.evaluate(()=>({...fileLibrary.loop})),wave=await page.locator('#fileWaveform').boundingBox();
 await page.mouse.move(wave.x+wave.width-2,wave.y+30);await page.mouse.down();await page.mouse.move(wave.x+wave.width*.75,wave.y+30,{steps:6});await page.mouse.up();
 expect(await page.evaluate(()=>fileLibrary.loop.end)).toBeLessThan(before.end-.1);
 await page.locator('#spectrogramTab').click();await expect(page.locator('#spectrogram')).toBeVisible();
 const geometry=await page.evaluate(()=>{const p=canvas.getBoundingClientRect(),d=document.getElementById('fileWaveform').getBoundingClientRect();return {chartLeft:p.left+52,waveLeft:d.left,chartRight:p.right-12,waveRight:d.right};});
 expect(geometry.waveLeft).toBeCloseTo(geometry.chartLeft,0);expect(geometry.waveRight).toBeCloseTo(geometry.chartRight,0);
 await page.locator('#openFiles').click();await page.locator('#audioFileList button').click();await page.waitForFunction(()=>Number(canvas.dataset.fileFrames)>0);
 const restored=await page.evaluate(()=>({start:filePreview.start,end:filePreview.end,time:fileLibrary.position,selection:fileLibrary.loop}));expect(restored.start).toBeLessThanOrEqual(restored.time);expect(restored.end).toBeGreaterThanOrEqual(restored.time);expect(restored.selection).toBeNull();

 expect(errors).toEqual([]);
});
test('mobile keeps microphone and example controls but offers no saved-file import',async({page},info)=>{
 test.skip(info.project.name!=='mobile-retina');await open(page);
 for(const id of ['openFiles','openAudio','filesSection','fileTransport'])await expect(page.locator('#'+id)).toBeHidden();
 await expect(page.locator('#demo')).toBeVisible();await expect(page.locator('#begin')).toBeVisible();
 await page.locator('#audioFileInput').setInputFiles(fixture);await expect(page.locator('#audioFileList button')).toHaveCount(0);
});
