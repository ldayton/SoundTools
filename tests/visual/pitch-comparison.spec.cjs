const {test,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'../..'),folder=path.join(base,'outputs/pitch-comparison');
test('controlled pitch replay uses production drawing and preserves silence',async({page},info)=>{
 test.skip(info.project.name!=='desktop');await page.goto('/dist/index.html');await page.addScriptTag({url:'/tests/pitch-comparison/replay.js'});
 const result=await page.evaluate(async()=>{const rate=48000,pcm=Float32Array.from({length:rate*3},(_,i)=>i<rate?0:.1*Math.sin(2*Math.PI*200*i/rate)+.04*Math.sin(2*Math.PI*400*i/rate));return runPitchComparison(pcm,rate)});
 expect(result.plottedUntil).toBeCloseTo(3-result.preset.confirmationMs/1000,8);expect(result.observations.filter(p=>p.time<.7&&p.hz>0)).toHaveLength(0);expect(result.observations.filter(p=>p.time>1.3&&p.time<2.7&&Math.abs(p.hz-200)<5).length).toBeGreaterThan(8);
});
test('selected corpus replay produces inspectable pitch artifacts',async({page},info)=>{
 test.skip(info.project.name!=='desktop'||process.env.PITCH_COMPARISON!=='1','Local corpus run is explicitly enabled');test.setTimeout(120000);
 const run=JSON.parse(fs.readFileSync(path.join(folder,'run.json')));fs.mkdirSync(path.join(folder,'replay'),{recursive:true});
 for(const clip of run.clips){await page.goto('/dist/index.html');await page.addScriptTag({url:'/tests/pitch-comparison/replay.js'});
  const result=await page.evaluate(async id=>{const b=await(await fetch('/outputs/pitch-comparison/'+id+'.f32')).arrayBuffer();return runPitchComparison(new Float32Array(b))},clip.id);
  expect(result.plottedUntil).toBeCloseTo(clip.seconds,2);result.pcmSha256=clip.pcmSha256;fs.writeFileSync(path.join(folder,'replay',clip.id+'.json'),JSON.stringify(result));await page.locator('#pitchCanvas').screenshot({path:path.join(folder,'replay',clip.id+'.png')});
 }
});
