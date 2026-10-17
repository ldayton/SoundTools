const {test,expect}=require('@playwright/test');
test('English example runs through the real AudioWorklet and worker',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/dist/index.html');await page.getByRole('button',{name:'Play an Example',exact:true}).click();
 await expect(page.locator('#state')).toHaveText('EXAMPLE');
 await page.waitForFunction(()=>Number(document.getElementById('spectrogram').dataset.processedFrames)>200,undefined,{timeout:10000});
 const progress=testInfo.project.name==='wide-retina'?12:2;
 const start=await page.locator('#spectrogram').getAttribute('data-plotted-until');
 await page.waitForFunction(({previous,progress})=>Number(document.getElementById('spectrogram').dataset.plottedUntil)>Number(previous)+progress,{previous:start,progress},{timeout:20000});
 const health=await page.evaluate(()=>({sampleRate:audio.sampleRate,audioTime:audio.currentTime,plottedUntil:Number(canvas.dataset.plottedUntil),frames:processingStats.frames,underflowHolds:processingStats.underflowHolds||0,analysisMs:processingStats.lastMs,maxPlayoutLag:processingStats.maxPlayoutLag,discontinuousBatches:processingStats.discontinuousBatches||0,running,source:inputMode,notice:document.getElementById('notice').textContent}));
 await testInfo.attach('live-pipeline-health',{body:JSON.stringify(health,null,2),contentType:'application/json'});
 expect(errors).toEqual([]);expect(health.discontinuousBatches,'Fresh speech capture must not lose PCM batches').toBe(0);expect(health.running).toBe(true);expect(health.source).toBe('speech');expect(health.notice).toBe('');expect(health.audioTime-health.plottedUntil).toBeGreaterThanOrEqual(.29);
 if(testInfo.project.name==='wide-retina')await testInfo.attach('wide-live-spectrum',{body:Buffer.from(await page.locator('#spectrogram').evaluate(canvas=>canvas.toDataURL('image/png').split(',')[1]),'base64'),contentType:'image/png'});
 await page.getByRole('link',{name:'Soundglow home'}).click();await expect(page.getByRole('button',{name:'Start microphone',exact:true}).last()).toBeVisible();
});
