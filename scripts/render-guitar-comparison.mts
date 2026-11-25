/** Manual listening tool. Uses the normal host/resource locks and silent browser
 * harness; renders PCM offline, never through the computer's speakers.
 * node --import tsx scripts/render-guitar-comparison.mts [baseline-git-ref]
 */
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import {mkdirSync,writeFileSync,rmSync} from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,"..");
const {git}=require("./ci/snapshot.cjs");
const baseline=process.env.GUITAR_BASELINE || process.argv[2] || "origin/main";
const output=path.join(root,"work/guitar-comparison");
mkdirSync(output,{recursive:true});

if(!process.env.GUITAR_COMPARISON_WORKER){
  const ref=git(root,["rev-parse",baseline]);
  const lock=path.join(path.resolve(root,git(root,["rev-parse","--git-common-dir"])),"soundtools-ci.lock");
  mkdirSync(lock);writeFileSync(path.join(lock,"owner.json"),JSON.stringify({pid:process.pid,directory:root,diagnostic:"guitar listening comparison"}));
  try{
    const args=["--import","tsx","scripts/render-guitar-comparison.mts"];
    const policy=require("./ci/inventory.cjs").declaration("songalong","node",args);
    const result=await require("./ci/run.cjs").runTasks([{
      id:"guitar-listening-comparison",command:process.execPath,args,cwd:root,needs:[],...policy,
      env:{GUITAR_COMPARISON_WORKER:"1",GUITAR_BASELINE:ref},timeoutMs:120000,
    }],{workers:1,identity:{tier:"nightly",diagnostic:"Manual loudness-matched guitar renders; not a full Nightly run",baseline:ref}});
    if(!result.passed)process.exitCode=1;
  }finally{rmSync(lock,{recursive:true});}
}else{
  const {createServer}=await import("vite");
  const {launchBrowser,newPage,closeBrowser,captureFailure}=require("./ci/browser-harness.cjs");
  const {default:abcjs}=await import("abcjs");
  const {default:hymns}=await import("../packages/music-practice/src/hymns.json",{with:{type:"json"}});
  const {arrangeHymn}=await import("../packages/music-practice/src/hymn-arrangements.ts");
  const {hymnPlaybackScore}=await import("../packages/music-practice/src/hymn-playback-score.ts");
  const {playbackNotes}=await import("../packages/music-practice/src/hymn-playback.ts");
  const {chordEdition}=await import("../packages/music-practice/src/instrument-editions.ts");
  const source=(file:string)=>execFileSync("git",["show",`${baseline}:packages/music-practice/src/${file}`],{cwd:root,encoding:"utf8"});
  writeFileSync(path.join(output,"baseline-performance.ts"),source("playback-performance.ts"));
  writeFileSync(path.join(output,"baseline-samples.ts"),source("playback-samples.ts")
    .replaceAll('"./assets/','"/packages/music-practice/src/assets/')
    .replace('"./playback-performance"','"/work/guitar-comparison/baseline-performance.ts"'));
  writeFileSync(path.join(output,"entry.html"),`<!doctype html><script type="module">
    import {performNotes,playbackInstrumentGain} from '/packages/music-practice/src/playback-performance.ts';
    import {performNotes as oldPerformance} from '/work/guitar-comparison/baseline-performance.ts';
    import {playbackSample} from '/packages/music-practice/src/playback-samples.ts';
    import {playbackSample as oldSample} from '/work/guitar-comparison/baseline-samples.ts';
    import {performanceEnvelope} from '/packages/music-practice/src/performance-envelope.ts';
    window.guitarRender=async(input)=>{
      const options={instrument:'guitar',strum:input.strum,meter:input.meter,pickup:input.pickup,
        positionFor:(pitch,chord)=>input.positions[pitch+':'+chord]};
      const notes=(input.before?oldPerformance:performNotes)(input.notes,options).filter(n=>!n.instrument||n.instrument==='guitar');
      const context=new OfflineAudioContext(2,Math.ceil((input.beats*60/input.tempo+0.2)*24000),24000);
      const buffers=new Map(),requests=new Map();let decodedBytes=0;
      const sampleFor=input.before?oldSample:playbackSample;
      for(const note of notes){
        const sample=sampleFor('guitar',note.pitch,note.volume,note.string);
        if(!buffers.has(sample.url)){
          const response=await fetch(sample.url);if(!response.ok)throw Error('Sample fetch failed');
          const bytes=await response.arrayBuffer();requests.set(sample.url,bytes.byteLength);
          const decoded=await context.decodeAudioData(bytes);buffers.set(sample.url,decoded);
          decodedBytes+=decoded.length*decoded.numberOfChannels*4;
        }
        const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffers.get(sample.url);
        source.playbackRate.value=2**((note.pitch-sample.pitch)/12);
        const start=note.start*60/input.tempo;
        const duration=Math.min(note.duration,input.beats-note.start)*60/input.tempo;
        const delay=Math.min(note.delay||0,Math.max(0,duration-0.015));
        const level=playbackInstrumentGain('guitar')*Math.sqrt(note.volume)*(note.gain||1);
        performanceEnvelope(gain.gain,level,start+delay,Math.max(start+delay+0.02,start+duration),0.045,input.before?1:note.endGain);
        source.connect(gain).connect(context.destination);source.start(start+delay);source.stop(start+duration+0.06);
      }
      const start=performance.now(),buffer=await context.startRendering();
      const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>Array.from(buffer.getChannelData(i)));
      const peak=Math.max(...channels.map(pcm=>pcm.reduce((p,x)=>Math.max(p,Math.abs(x)),0)));
      const sum=channels.reduce((total,pcm)=>total+pcm.reduce((s,x)=>s+x*x,0),0);
      return {channels,renderMs:performance.now()-start,decodedBytes,downloadBytes:[...requests.values()].reduce((a,b)=>a+b,0),sampleFiles:requests.size,
        attacks:notes.length,peak,rms:Math.sqrt(sum/(buffer.length*buffer.numberOfChannels))};
    };window.guitarReady=true;
  </script>`);
  const server=await createServer({configFile:false,root,cacheDir:path.join(output,"vite-cache"),server:{host:"127.0.0.1",port:4686,strictPort:true},logLevel:"error"});
  await server.listen();const browser=await launchBrowser();
  const cases=[
    {id:"the-old-rugged-cross",arrangement:"guitar-edition" as const,beats:18,tempo:80,label:"Old Rugged Cross · fingerstyle"},
    {id:"ill-fly-away",arrangement:"guitar-edition" as const,beats:24,tempo:80,label:"I'll Fly Away · fingerstyle"},
    {id:"the-old-rugged-cross",arrangement:"guitar-vocal" as const,beats:24,tempo:80,label:"Old Rugged Cross · accompaniment"},
  ];
  const report=[];
  try{
    const page=await newPage(browser),errors:string[]=[];page.on("pageerror",(e:Error)=>errors.push(e.message));
    await page.goto("http://127.0.0.1:4686/work/guitar-comparison/entry.html");
    await page.waitForFunction(()=>Boolean((window as any).guitarReady));
    for(const item of cases){
      const hymn=hymns.find(h=>h.slug===item.id)!;
      const score=arrangeHymn(hymn,item.arrangement,0),edition=chordEdition(hymn)!;
      const audio=abcjs.parseOnly(score.abc)[0].setUpAudio({qpm:60,chordsOff:true});
      const plan=hymnPlaybackScore({hymn,arrangement:item.arrangement,sectionBars:0,section:0,hands:"both",totalBars:score.totalBars,sections:1,abc:score.abc,audio,transpose:0,stanzas:[1]});
      const notes=playbackNotes(plan.audio).filter(n=>n.start<item.beats);
      const positions:Record<string,unknown>={};
      for(const n of notes)for(const chord of [true,false])positions[n.pitch+":"+chord]=edition.position(n.pitch-(item.arrangement==="guitar-edition"?edition.capo:0),chord,0);
      const pair=[];
      for(const before of [true,false]){
        const rendered=await page.evaluate(input=>(window as any).guitarRender(input),{...item,notes,positions,strum:item.arrangement==="guitar-vocal",meter:plan.timing.meter,pickup:plan.timing.pickup,before});
        assert(rendered.channels.every((pcm:number[])=>pcm.every(Number.isFinite)));assert(rendered.peak>0.001&&rendered.peak<1,`${item.id} raw peak ${rendered.peak}`);
        pair.push(rendered);
      }
      assert.equal(pair[0].attacks,pair[1].attacks);
      const rms=Math.min(...pair.map(p=>p.rms));
      for(const [i,render] of pair.entries()){
        const gain=rms/render.rms,file=`${item.id}-${item.arrangement}-${i===0?"before":"after"}.wav`;
        const channels:number[][]=render.channels,frameBytes=channels.length*2;
        const pcm=Buffer.alloc(channels[0].length*frameBytes);
        for(let frame=0;frame<channels[0].length;frame++)for(let channel=0;channel<channels.length;channel++)
          pcm.writeInt16LE(Math.round(channels[channel][frame]*gain*32767),frame*frameBytes+channel*2);
        const header=Buffer.alloc(44);header.write("RIFF");header.writeUInt32LE(36+pcm.length,4);header.write("WAVEfmt ",8);
        header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(channels.length,22);header.writeUInt32LE(24000,24);
        header.writeUInt32LE(24000*frameBytes,28);header.writeUInt16LE(frameBytes,32);header.writeUInt16LE(16,34);header.write("data",36);header.writeUInt32LE(pcm.length,40);
        writeFileSync(path.join(output,file),Buffer.concat([header,pcm]));
        const {channels:renderedChannels,...metrics}=render;report.push({...item,before:i===0,file,channels:renderedChannels.length,matchedRms:rms,normalizationGain:gain,...metrics});
      }
    }
    assert.deepEqual(errors,[]);
    writeFileSync(path.join(output,"metrics.json"),JSON.stringify({baseline,head:git(root,["rev-parse","HEAD"]),dirty:!!git(root,["status","--porcelain"]),renders:report},null,2)+"\n");
    console.log(JSON.stringify(report,null,2));
  }catch(error){await captureFailure(browser,error,path.join(output,"failure"));throw error;}
  finally{await closeBrowser(browser);await server.close();}
}
