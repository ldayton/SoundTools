// Capture brackets are playback-clock bounds, not claims of calibrated display latency.
export function validateClock(s,runId,now=Date.now()/1000){
 if(s.runId!==runId)throw Error('Playback belongs to a different run');
 if(s.phase!=='running'||!Number.isFinite(s.seconds)||s.seconds<0||!Number.isInteger(s.inputDevice)||s.inputDevice<=0||!Number.isFinite(s.wall)||now-s.wall>.5||s.wall-now>.1||s.rate!==48000||s.inputDevice!==s.currentInput)throw Error('Playback clock/route is stale or inactive');
 return s;
}
export async function createCapture({nativeApp,tab,fs,folder,nativeSettingsConfirmed=false}){
 if(!nativeSettingsConfirmed)throw Error('Confirm native pitch range 50–500 Hz and 10-second history first');
 const run=JSON.parse(await fs.readFile(folder+'/run.json','utf8')),rows=[];
 async function preflight(){
  const settings=await tab.playwright.evaluate(()=>({...Object.fromEntries(['pitchPreset','pitchMinimum','pitchMaximum','pitchHistory'].map(id=>[id,document.getElementById(id).value])),pitchActive:document.getElementById('pitchTab').getAttribute('aria-selected')==='true',dpr:window.devicePixelRatio}));
  if(!settings.pitchActive||settings.dpr!==1||settings.pitchPreset!=='voice'||settings.pitchMinimum!=='50'||settings.pitchMaximum!=='500'||settings.pitchHistory!=='10')throw Error('Soundglow settings do not match manifest');
  if(!(await tab.playwright.locator('#device').textContent()).includes('BlackHole')||await tab.playwright.locator('#state').textContent()!=='LIVE')throw Error('Soundglow must be live on BlackHole');return settings;
 }
 const settings=await preflight();await fs.mkdir(folder+'/live',{recursive:true});let lastClock=-1;
 async function status(){const s=validateClock(JSON.parse(await fs.readFile(folder+'/status.json','utf8')),run.runId);if(s.seconds<lastClock)throw Error('Playback clock reversed');lastClock=s.seconds;return s}
 async function until(target){let s=await status(),progress=s.seconds,progressAt=Date.now();while(s.seconds<target){if(s.seconds>progress){progress=s.seconds;progressAt=Date.now()}else if(Date.now()-progressAt>1000)throw Error("Playback clock is not advancing");await new Promise(r=>setTimeout(r,Math.min(100,(target-s.seconds)*1000)));s=await status()}return s}
 return {rows,async capture(count=4){for(let j=0;j<count&&rows.length<run.clips.length;j++){
  await preflight();const clip=run.clips[rows.length];await until(clip.end+.25);
  const nb=await status(),nativeWall=Date.now(),nativePng=await nativeApp.getScreenshot({emit:false}),na=await status(),nativeCompleted=Date.now();
  await until(clip.end+.55);const bounds=await tab.playwright.locator('#pitchCanvas').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,end:el.dataset.plottedUntil,voiced:el.dataset.voiced}});
  if(!Number.isFinite(Number(bounds.end))||![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<=63||bounds.height<=62)throw Error('Invalid chart geometry/clock');
  const sb=await status(),soundglowWall=Date.now(),soundglowPng=await tab.screenshot({fullPage:false}),sa=await status(),soundglowCompleted=Date.now();
  const drift=rows.length?Math.abs((Number(bounds.end)-Number(rows.at(-1).bounds.end))-(sa.seconds-rows.at(-1).soundglowInterval[1])):0;
  const late=na.seconds>clip.end+1||sa.seconds>clip.end+1.3||na.seconds-nb.seconds>.5||sa.seconds-sb.seconds>.5||drift>.25;
  await fs.writeFile(folder+'/live/'+clip.id+'-voice-tools.png',nativePng);await fs.writeFile(folder+'/live/'+clip.id+'-soundglow.png',soundglowPng);
  rows.push({id:clip.id,pcmSha256:clip.pcmSha256,clipStart:clip.start,clipEnd:clip.end,nativeAt:(nb.seconds+na.seconds)/2,soundglowAt:(sb.seconds+sa.seconds)/2,nativeInterval:[nb.seconds-.04,na.seconds+.04],soundglowInterval:[sb.seconds-.04,sa.seconds+.04],nativeWall,nativeCompleted,soundglowWall,soundglowCompleted,bounds,clockDrift:drift,late});
  await fs.writeFile(folder+'/captures.json',JSON.stringify({clockVersion:2,runId:run.runId,latencyCalibrated:false,nominalSoundglowDelay:.3,nativeSettingsConfirmed,settings,rows},null,2));
 }return {captured:rows.length,total:run.clips.length}}};
}
