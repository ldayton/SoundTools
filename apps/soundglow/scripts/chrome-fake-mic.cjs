// SPDX-License-Identifier: GPL-3.0-or-later
// Interactive local Chrome investigation; separate profile, real getUserMedia.
const {chromium}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]};
const root=path.resolve(__dirname,'..'),input=path.resolve(option('--audio',path.join(root,'dist/audio/speech-english.wav'))),output=path.resolve(option('--output',path.join(root,'test-results/chrome-mic'))),profile=path.resolve(option('--profile',path.join(root,'../work/chrome-fake-mic'))),url=option('--url','http://localhost:8765/dist/'),seconds=Number(option('--seconds','70'));
if(!Number.isFinite(seconds)||seconds<1)throw Error('Invalid --seconds');if(!fs.existsSync(input))throw Error('Audio file not found: '+input);fs.mkdirSync(output,{recursive:true});
const wav=fs.readFileSync(input);let byteRate=0,dataBytes=0;
if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw Error('Expected RIFF WAV input');
for(let offset=12;offset+8<=wav.length;){const kind=wav.toString('ascii',offset,offset+4),size=wav.readUInt32LE(offset+4);if(kind==='fmt ')byteRate=wav.readUInt32LE(offset+16);if(kind==='data')dataBytes=size;offset+=8+size+(size%2)}
if(!byteRate||!dataBytes)throw Error('WAV duration unavailable');const duration=dataBytes/byteRate;
(async()=>{
 const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:false,viewport:{width:1272,height:800},deviceScaleFactor:2,args:['--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+input]});
 await context.grantPermissions(['microphone'],{origin:new URL(url).origin});
 const page=context.pages()[0]||await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.locator('#begin').click();await page.waitForFunction(()=>document.getElementById('state').textContent==='LIVE',{},{timeout:15000});
 const initial=await page.evaluate(()=>({mode:inputMode,label:stream.getAudioTracks()[0].label,settings:stream.getAudioTracks()[0].getSettings(),sampleRate:audio.sampleRate}));
 if(initial.mode!=='mic'||!/fake/i.test(initial.label))throw Error('Expected Chrome fake microphone: '+JSON.stringify(initial));
 await page.evaluate(()=>{
  window.micInvestigation={started:performance.now(),active:true,packets:[],raf:[],renderMs:[],fullRepaintMs:[],longTasks:[],lastRAF:0};
  const originalRender=render;render=function(time){const started=performance.now();try{return originalRender(time)}finally{if(window.micInvestigation.active)window.micInvestigation.renderMs.push(performance.now()-started)}};
  const originalColour=PraatDisplay.colourPixels;PraatDisplay.colourPixels=function(...args){const started=performance.now();try{return originalColour(...args)}finally{if(window.micInvestigation.active&&args[1]>pxW/2)window.micInvestigation.fullRepaintMs.push(performance.now()-started)}};
  pcmNode.port.addEventListener('message',({data})=>{const s=window.micInvestigation;if(!s.active)return;let power=0;for(const value of data.pcm)power+=value*value;s.packets.push({time:data.start,rms:Math.sqrt(power/data.pcm.length),samples:data.pcm.length})});
  const tick=now=>{const s=window.micInvestigation;if(!s.active)return;if(s.lastRAF)s.raf.push(now-s.lastRAF);s.lastRAF=now;requestAnimationFrame(tick)};requestAnimationFrame(tick);
  if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>{for(const entry of list.getEntries())window.micInvestigation.longTasks.push({start:entry.startTime,duration:entry.duration})}).observe({type:'longtask',buffered:false});
 });
 console.log('Chrome fake microphone running:',JSON.stringify(initial));
 const profiler=args.includes('--cpu-profile')?await context.newCDPSession(page):null;
 if(profiler){await profiler.send('Profiler.enable');await profiler.send('Profiler.start')}
 const samples=[];
 for(let elapsed=0;elapsed<seconds;elapsed++){
  await page.waitForTimeout(1000);
  samples.push(await page.evaluate(()=>({time:audio.currentTime,plotted:Number(canvas.dataset.plottedUntil),frames:processingStats.frames,holds:processingStats.underflowHolds||0,maxLag:processingStats.maxPlayoutLag,gaps:processingStats.discontinuousBatches||0,analysisMs:processingStats.lastMs,notice:document.getElementById('notice').textContent,running,source:inputMode})));
  if((elapsed+1)%10===0){fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(samples.at(-1),null,2));console.log('Progress',elapsed+1,JSON.stringify(samples.at(-1)))}
 }
 if(profiler){const {profile}=await profiler.send('Profiler.stop');fs.writeFileSync(path.join(output,'renderer.cpuprofile'),JSON.stringify(profile))}
 const observed=await page.evaluate(()=>{window.micInvestigation.active=false;return window.micInvestigation});
 const stats=values=>{const a=values.slice().sort((x,y)=>x-y);return {p50:a[Math.floor(a.length*.5)],p95:a[Math.min(a.length-1,Math.floor(a.length*.95))],max:a.at(-1)}};
 function correlation(a,b){const ma=a.reduce((x,y)=>x+y,0)/a.length,mb=b.reduce((x,y)=>x+y,0)/b.length;let xy=0,xx=0,yy=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;xy+=x*y;xx+=x*x;yy+=y*y}return xy/Math.sqrt(xx*yy)}
 const envelope=observed.packets.map(p=>p.rms),period=Math.round(duration/.1),loopCorrelation=envelope.length>period+20?correlation(envelope.slice(0,-period),envelope.slice(period)):null;
 const report={browser:context.browser().version(),input,url,initial,seconds,samples,framesBetweenRAFsMs:stats(observed.raf),renderMs:stats(observed.renderMs),fullRepaintMs:{count:observed.fullRepaintMs.length,...stats(observed.fullRepaintMs)},plotLagSeconds:stats(samples.map(s=>s.time-s.plotted)),loop:{packetCount:envelope.length,periodPackets:period,periodSeconds:duration,envelopeCorrelation:loopCorrelation},longTasks:observed.longTasks,errors};
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(output,'packets.json'),JSON.stringify(observed.packets));await page.screenshot({path:path.join(output,'chrome-fake-mic.png')});
 console.log('REPORT',JSON.stringify({browser:report.browser,loop:report.loop,raf:report.framesBetweenRAFsMs,render:report.renderMs,fullRepaint:report.fullRepaintMs,lag:report.plotLagSeconds,longTasks:report.longTasks.length,errors}));console.log('Saved to',output);
 if(args.includes('--keep-open')){console.log('Chrome remains open with looping fake microphone. Close that window to finish.');await new Promise(resolve=>context.on('close',resolve))}else await context.close();
})().catch(error=>{console.error(error);process.exitCode=1});
