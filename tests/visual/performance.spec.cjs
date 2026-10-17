const {test,expect}=require('@playwright/test');
for(const [preset,formants]of [['praat','off'],['voice','off'],['voice','both']])test(`performance report bounds live lag: ${preset}/${formants}`,async({page},testInfo)=>{
 await page.goto('/dist/index.html#settings');await page.locator('#preset').selectOption(preset);await page.locator('#formants').selectOption(formants);await expect(page.locator('#developerSettings')).not.toHaveAttribute('open','');await page.locator('#developerSettings > summary').click();await page.locator('#measurePerformance').check();
 await page.getByRole('button',{name:'Return to spectrogram',exact:true}).click();await page.getByRole('button',{name:'Play an Example',exact:true}).click();
 await page.waitForFunction(()=>window.soundglowPerformance.report().metrics.renderCallbackMs?.count>=240);
 const report=await page.evaluate(()=>window.soundglowPerformance.report());await testInfo.attach('performance-report',{body:JSON.stringify(report,null,2),contentType:'application/json'});
 expect(report.metadata.source).toBe('speech');expect(report.metrics.analysisMs.count).toBeGreaterThan(30);expect(report.metrics.workerRoundTripMs.count).toBeGreaterThan(30);
 expect(report.metrics.plottedAgeMs.p95,'Sustained excessive visual lag must fail').toBeLessThan(650);expect(report.metrics.plottedAgeMs.max).toBeLessThan(1500);
 expect(report.metrics.animationIntervalMs.p95).toBeLessThan(80);expect(report.metrics.plotAdvanceIntervalMs.max).toBeLessThan(1000);
 for(const name of ['discontinuousBatches','discardedAnalysisFrames','captureDiscontinuitiesAfterWarmup','backlogResets'])expect(report.counts[name]||0,name).toBe(0);
 await page.getByRole('button',{name:'Settings',exact:true}).click();const downloadPromise=page.waitForEvent('download');await page.locator('#exportPerformance').click();const download=await downloadPromise;expect(download.suggestedFilename()).toMatch(/^soundglow-performance-.*\.json$/);
 await page.locator('#resetPerformance').click();expect((await page.evaluate(()=>window.soundglowPerformance.report())).metrics).toEqual({});
});

test('looping fake microphone exports bounded lag across the recording loop',async({playwright},testInfo)=>{
 test.setTimeout(90000);
 const path=require('node:path');const browser=await playwright.chromium.launch({args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+path.join(__dirname,'generated/capture.wav')]});
 try{
 const context=await browser.newContext({viewport:testInfo.project.use.viewport,deviceScaleFactor:testInfo.project.use.deviceScaleFactor,permissions:['microphone']});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8779/dist/index.html#settings');await page.locator('#preset').selectOption('voice');await expect(page.locator('#developerSettings')).not.toHaveAttribute('open','');await page.locator('#developerSettings > summary').click();await page.locator('#measurePerformance').check();await page.getByRole('button',{name:'Return to spectrogram',exact:true}).click();await page.locator('#begin').click();
 await page.waitForFunction(()=>Number(canvas.dataset.plottedUntil)>32,undefined,{timeout:50000});
 const report=await page.evaluate(()=>soundglowPerformance.report());require('node:fs').mkdirSync(testInfo.outputDir,{recursive:true});require('node:fs').writeFileSync(testInfo.outputPath('performance.json'),JSON.stringify(report,null,2));await testInfo.attach('looping-microphone-performance',{body:JSON.stringify(report,null,2),contentType:'application/json'});
 expect(errors).toEqual([]);expect(report.metadata.source).toBe('mic');expect(report.metrics.capturePacketAgeMs.count).toBeGreaterThan(250);expect(report.metrics.plottedAgeMs.p95).toBeLessThan(650);expect(report.metrics.plottedAgeMs.max).toBeLessThan(1500);expect(report.metrics.plotAdvanceIntervalMs.max).toBeLessThan(1000);
 for(const name of ['discontinuousBatches','captureDiscontinuitiesAfterWarmup','backlogResets','discardedAnalysisFrames'])expect(report.counts[name]||0,name).toBe(0);
 await page.getByRole('button',{name:'Pause',exact:true}).click();await page.waitForTimeout(400);await page.getByRole('button',{name:'Resume',exact:true}).click();await page.waitForTimeout(3000);const resumed=await page.evaluate(()=>soundglowPerformance.report());expect(resumed.metrics.renderCallbackMs.count).toBeGreaterThan(report.metrics.renderCallbackMs.count);
 }finally{await browser.close()}
});
