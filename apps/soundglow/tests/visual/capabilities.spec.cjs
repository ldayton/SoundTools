const {test,expect}=require('@playwright/test');
test('optional capabilities use real worker LPC without changing the view or preset',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/dist/index.html');
 const before=await page.locator('#preset').inputValue();
 const result=await page.evaluate(async()=>{
  const api=window.soundglowAnalysis,client=api.createClient();
  try{
   const context=new AudioContext();try{
    const response=await fetch('audio/alice-waters.m4a'),buffer=await context.decodeAudioData(await response.arrayBuffer()),pcm=buffer.getChannelData(0).slice(Math.round(buffer.sampleRate*2),Math.round(buffer.sampleRate*2.2));
    const r=await client.lpc({pcm,sampleRate:buffer.sampleRate},{transfer:true});
    return {method:r.method,bins:r.power.length,finite:Array.from(r.power).every(Number.isFinite),hasEnergy:r.power.some(v=>v>0),tracker:typeof api.FormantTracker,targets:typeof api.VowelTargets};
   }finally{await context.close()}
  }finally{client.dispose()}
 });
 expect(result).toEqual({method:'praat-burg',bins:512,finite:true,hasEnergy:true,tracker:'function',targets:'function'});await expect(page.locator('#preset')).toHaveValue(before);await expect(page.locator('#welcome')).toBeVisible();expect(errors).toEqual([]);
});
