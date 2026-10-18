const {test,expect}=require('@playwright/test');
const {manifest}=require('./voice-fixture.cjs');
async function compareSpeech(page,testInfo){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/tests/visual/generated/voice.html');
 await page.waitForFunction(()=>window.voiceReplay?.status&&window.voiceReplay.status!=='running');
 const replay=await page.evaluate(()=>window.voiceReplay);
 expect(replay.status,replay.error).toBe('complete');expect(errors).toEqual([]);
 expect(replay.underflowHolds).toBe(0);expect(replay.displayEnd).toBeCloseTo(10,8);expect(replay.columns).toBe(replay.width);
 const result=await page.evaluate(()=>{
  const {reference:r,frames}=window.voiceComparison;
  // The oracle formulas and RGB palette are independent of the app's axis/color helpers.
  let maxDb=0,sumDb=0,dbCount=0,maxHold=0,maxNormalized=0,maxTime=0;
  for(let j=0;j<frames.length;j++){
   const f=frames[j];maxTime=Math.max(maxTime,Math.abs(f.time-r.times[j]));maxHold=Math.max(maxHold,Math.abs(f.levelMaximum-r.holds[j]));
   for(let k=0;k<f.power.length;k++){
    const db=Math.max(0,Math.min(255,10*Math.log10(f.power[k])+92));
    if(r.spectra[j][k]>20){const error=Math.abs(db-r.spectra[j][k]);maxDb=Math.max(maxDb,error);sumDb+=error;dbCount++;maxNormalized=Math.max(maxNormalized,Math.abs(db/f.levelMaximum-r.normed[j][k]));}
   }
  }
  const actual=ctx.getImageData(pxLeft,pxTop,pxW,pxH),expected=ctx.createImageData(pxW,pxH),difference=ctx.createImageData(pxW,pxH);
  const colours=new Map(r.palette.map((rgb,i)=>[rgb.join(','),i]));let pixels=0,unknown=0,withinOne=0,sumIndex=0,maxIndex=0;
  for(let x=0;x<pxW;x++){
   const time=(x+.5)*10/pxW,j=Math.floor((time-.032)/.016+1e-9);
   for(let y=0;y<pxH;y++){
    const hz=Math.expm1(Math.log1p(.00437*4000)*(1-(y+1)/pxH))/.00437;
    const bin=Math.max(0,Math.min(512,Math.trunc(1+hz/7.8125)));
    const index=j<0?0:Math.floor(Math.max(0,Math.min(255,r.normed[j][bin]*255)));
    const at=(y*pxW+x)*4,rgb=r.palette[index];expected.data.set([...rgb,255],at);
    const observed=colours.get(Array.from(actual.data.subarray(at,at+3)).join(','));
    const error=observed===undefined?255:Math.abs(observed-index);if(observed===undefined||actual.data[at+3]!==255)unknown++;
    pixels++;sumIndex+=error;maxIndex=Math.max(maxIndex,error);if(error<=1)withinOne++;
    difference.data.set([Math.min(255,error*80),0,0,255],at);
   }
  }
  // Always retain a reviewable comparison, including on threshold failure.
  const view=document.createElement('canvas');view.width=pxW*3;view.height=pxH+36;const c=view.getContext('2d');c.fillStyle='#101521';c.fillRect(0,0,view.width,view.height);c.fillStyle='white';c.font='16px sans-serif';
  for(const [i,label,data] of [[0,'Independent corrected JS DSP',expected],[1,'Soundglow production renderer',actual],[2,'Palette-index difference (red)',difference]]){c.fillText(label,i*pxW+8,23);c.putImageData(data,i*pxW,36)}
  window.voiceComparisonPng=view.toDataURL('image/png').split(',')[1];
  return {frames:frames.length,bins:frames[0].power.length,maxTime,maxDb,meanDb:sumDb/dbCount,maxHold,maxNormalized,pixels,unknown,withinOne:withinOne/pixels,meanPaletteError:sumIndex/pixels,maxPaletteError:maxIndex};
 });
 await testInfo.attach('voice-tools-metrics',{body:JSON.stringify({reference:manifest,...result},null,2),contentType:'application/json'});
 await testInfo.attach('voice-tools-side-by-side',{body:Buffer.from(await page.evaluate(()=>window.voiceComparisonPng),'base64'),contentType:'image/png'});
 return result;
}

test('full speech matches corrected independent DSP, timing and rendering',async({page},testInfo)=>{
 const result=await compareSpeech(page,testInfo);
 expect(result.frames).toBe(manifest.frameCount);expect(result.bins).toBe(manifest.bins);expect(result.maxTime).toBeLessThan(1e-8);
 expect(result.maxDb,'Corrected speech spectrum drift, bins above -72 dB').toBeLessThan(.001);
 expect(result.meanDb).toBeLessThan(.00005);expect(result.maxHold,'Timestamped wall-clock normalization drift').toBeLessThan(.001);expect(result.maxNormalized).toBeLessThan(.00001);
 expect(result.unknown,'Every rendered pixel must use the original discrete Plasma palette').toBe(0);
 expect(result.withinOne,'At least 99.99% of plot pixels must stay within one palette step').toBeGreaterThanOrEqual(.9999);
 expect(result.meanPaletteError).toBeLessThan(.02);expect(result.maxPaletteError).toBeLessThanOrEqual(2);
});


// Prove that the oracle can reject the regressions it is intended to protect.
// Mutate only the served test harness, never the source or the pinned reference.
test('speech oracle detects filter, clock and display-scale regressions',async({page},testInfo)=>{
 for(const [name,mutation] of [
  ['filter',"updateSettings({type:'edit',id:'resampling',value:'praat'});"],
  ['clock',"updateSettings({type:'edit',id:'normalizationClock',value:'audio'});"],
  ['scale',"updateSettings({type:'edit',id:'scale',value:'linear'});"]
 ]){
  await page.unroute('**/tests/visual/voice-harness.js');
  await page.route('**/tests/visual/voice-harness.js',async route=>{
   const response=await route.fetch(),script=await response.text(),needle='applyPreset("voice");';
   expect(script).toContain(needle);await route.fulfill({response,body:script.replace(needle,needle+mutation)});
  });
  const result=await compareSpeech(page,testInfo);
  if(name==='filter')expect(result.maxDb,'Restoring the old resampler must exceed the spectral guard').toBeGreaterThan(.001);
  if(name==='clock')expect(result.maxHold,'Audio-time buckets must exceed the wall-clock guard').toBeGreaterThan(.001);
  if(name==='scale')expect(result.withinOne,'A changed axis must exceed the rendered similarity guard').toBeLessThan(.9999);
 }
});
