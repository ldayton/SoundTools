const {test,expect}=require('@playwright/test');
test('local diagnostics remain private and usable during English playback',async({page})=>{
 const remote=[];page.on('request',r=>{if(/sentry\.io|telemetry\.invalid/.test(r.url()))remote.push(r.url())});
 await page.goto('/dist/index.html');await page.locator('#demo').click();await page.waitForFunction(()=>Number(canvas.dataset.plottedUntil)>2);
 await page.locator('#openSettings:visible, #settings:visible').click();await page.locator('#developerSettings > summary').click();await page.locator('.diagnostics-panel > summary').click();
 await expect(page.locator('.diagnostics-panel input')).toBeDisabled();
 const before=await page.evaluate(()=>soundglowSession.state());
 // Exercise the actual processorerror listener without stopping or corrupting audio.
 await page.evaluate(()=>pcmNode.dispatchEvent(new Event('processorerror')));
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download debug report',exact:true}).click();
 const file=await (await download).path(),report=JSON.parse(require('node:fs').readFileSync(file,'utf8'));
 expect(report.app).toBe('soundglow');expect(report.context.source).toBe('speech');expect(report.context.sampleRate).toBeGreaterThan(0);expect(report.errors.some(e=>e.code==='audio.worklet_failed')).toBe(true);
 expect(JSON.stringify(report)).not.toMatch(/Alice Waters|pcm|microphone label/i);
 expect(remote).toEqual([]);
 if(await page.evaluate(()=>!matchMedia('(min-width: 761px)').matches))await page.locator('#openSettings:visible, #settings:visible').click();
 await page.waitForFunction(t=>soundglowSession.state().time>t+.5,before.time);
 await page.waitForFunction(()=>SoundglowDiagnostics.snapshot().metrics['render.interval_ms']?.count>5);
 await page.evaluate(()=>SoundglowDiagnostics.clear());expect((await page.evaluate(()=>SoundglowDiagnostics.report())).errors).toEqual([]);
});
test('stopping and restarting playback excludes idle time from diagnostics',async({page})=>{
 await page.goto('/dist/index.html');await page.locator('#demo').click();
 await page.waitForFunction(()=>SoundglowDiagnostics.snapshot().metrics['render.interval_ms']?.count>5);
 await page.locator('#home').click();await expect(page.locator('#welcome')).toBeVisible();
 const count=await page.evaluate(()=>SoundglowDiagnostics.snapshot().metrics['render.interval_ms'].count);
 await page.waitForTimeout(300);await page.locator('#demo').click();await page.waitForFunction(()=>soundglowSession.state().running);await page.waitForTimeout(500);
 expect(await page.evaluate(()=>SoundglowDiagnostics.snapshot().metrics['render.interval_ms'].count)).toBe(count);
 await page.waitForFunction(n=>SoundglowDiagnostics.snapshot().metrics['render.interval_ms'].count>n+5,count);
});
