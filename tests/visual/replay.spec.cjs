const {test,expect}=require('@playwright/test');
test('English speech matches approved Soundglow canvas',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/tests/visual/generated/harness.html');
 await page.waitForFunction(()=>window.visualReplay?.status&&window.visualReplay.status!=='running');
 const result=await page.evaluate(()=>window.visualReplay);
 await testInfo.attach('replay-metadata',{body:JSON.stringify(result,null,2),contentType:'application/json'});
 expect(result.status,result.error).toBe('complete');expect(errors).toEqual([]);
 expect(result.sampleRate).toBe(24000);expect(result.hop).toBe(.005);expect(result.window).toBe(.005);expect(result.firstTime).toBeCloseTo(.005,10);expect(result.displayEnd).toBeCloseTo(10,10);expect(result.columns).toBe(result.width);expect(result.frames).toBe(2020);expect(result.maximum).toBeGreaterThan(90);
 const paintedRatio=await page.locator('#spectrogram').evaluate(canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let painted=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>40)painted++;return painted/(pixels.length/4)});
 expect(paintedRatio,'Completed replay must contain a visible spectrum').toBeGreaterThan(.15);
 const dimensions=await page.locator('#spectrogram').evaluate(canvas=>({width:canvas.width,height:canvas.height}));
 expect(dimensions).toEqual(testInfo.project.name==='desktop'?{width:629,height:739}:{width:748,height:1414});
 // Raw canvas excludes text/axes/legend overlays and OS font rasterization.
 const png=Buffer.from(await page.locator('#spectrogram').evaluate(canvas=>canvas.toDataURL('image/png').split(',')[1]),'base64');
 await testInfo.attach('actual-canvas',{body:png,contentType:'image/png'});
 expect(png).toMatchSnapshot('spectrogram.png');
});
