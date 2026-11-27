/** Render the capo-2 picked Guitar + Voice edition through SongAlong's real samples. */
import abcjs from "abcjs";
import {preview} from "../../../packages/music-practice/browser-tests/server";
import {createServer,type AddressInfo} from "node:net";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {launchBrowser,newPage,waitForServer,waitForApp,closeBrowser,captureFailure} from "../../../scripts/ci/browser-harness.cjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {arrangeHymn} from "../../../packages/music-practice/src/hymn-arrangements";
const root=resolve(import.meta.dirname,"../../.."),output=resolve(process.argv[2]||"work/christ-picked-preview");
await mkdir(output,{recursive:true});
const hymn=hymns.find(h=>h.slug==="in-christ-alone")!;
const score=arrangeHymn(hymn,"guitar-vocal",0);
await writeFile(resolve(output,"in-christ-alone-picked.abc"),score.abc);
const parsed=abcjs.parseOnly(score.abc)[0];
if(parsed.warnings?.length)throw Error(parsed.warnings.join("\n"));
const audio=parsed.setUpAudio({qpm:80,chordsOff:true});
const notes=audio.tracks.flatMap((track,index)=>track.flatMap(n=>n.cmd==="note"&&n.start<15?[{
  instrument:index===0?"choir":"guitar",pitch:n.pitch,start:n.start*3,duration:Math.min(n.duration,15-n.start)*3,volume:.7,
}]:[]));
await writeFile(resolve(output,"events.json"),JSON.stringify(notes,null,2));
const reservation=createServer();await new Promise<void>(r=>reservation.listen(0,"127.0.0.1",r));
const port=(reservation.address() as AddressInfo).port;await new Promise<void>(r=>reservation.close(()=>r()));
const vite=createRequire(import.meta.url).resolve("vite/package.json").replace(/package.json$/,"bin/vite.js");
const server=spawn(process.execPath,[vite,"--host","127.0.0.1","--port",String(port),"--strictPort"],{cwd:resolve(root,"apps/songalong"),stdio:"ignore"});
const previewServer=await preview("songalong",port+1);
let browser;
try {
  const base=`http://127.0.0.1:${port}`;await waitForServer(base,{server});
  browser=await launchBrowser();const page=await newPage(browser,{viewport:{width:1440,height:1100}});
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(previewServer.base+"/piano/hymns/in-christ-alone?arrangement=guitar-vocal&capo=2&mode=playback&tempo=80&stanzas=1");
  await waitForApp(page,".hymn-score-setup");
  if(!((await page.locator(".hymn-score-setup").textContent())||"").includes("Capo 2"))throw Error("Preview did not select capo 2");
  await page.screenshot({path:resolve(output,"score.png"),fullPage:true});
  for(const guide of [false,true]) {
    const rendered=await page.evaluate(async ({root,notes,guide,base})=>{
      const {playbackSample}=await import(/* @vite-ignore */ base+"/@fs"+root+"/packages/music-practice/src/playback-samples.ts");
      const {performNotes,playbackInstrumentGain}=await import(/* @vite-ignore */ base+"/@fs"+root+"/packages/music-practice/src/playback-performance.ts");
      const {christGuitarPosition}=await import(/* @vite-ignore */ base+"/@fs"+root+"/packages/music-practice/src/in-christ-alone-fingering.ts");
      const ctx=new OfflineAudioContext(2,48000*47,48000);
      const performed=performNotes(notes.filter((n:any)=>guide||n.instrument==="guitar"),{instrument:"guitar",strum:false,positionFor:((p:number,c:boolean)=>christGuitarPosition(p-2,c)).bind(null)});
      const buffers=new Map<string,AudioBuffer>();
      for(const note of performed){const sample=playbackSample(note.instrument,note.pitch,note.volume,note.string);if(!buffers.has(sample.url))buffers.set(sample.url,await ctx.decodeAudioData(await (await fetch(sample.url.startsWith("/")?base+sample.url:sample.url)).arrayBuffer()));}
      for(const note of performed){
        const sample=playbackSample(note.instrument,note.pitch,note.volume,note.string),source=ctx.createBufferSource(),gain=ctx.createGain();
        source.buffer=buffers.get(sample.url)!;source.playbackRate.value=2**((note.pitch-sample.pitch)/12);
        if(sample.loopStart!==undefined){source.loop=true;source.loopStart=sample.loopStart;source.loopEnd=sample.loopEnd;}
        const level=playbackInstrumentGain(note.instrument)*Math.sqrt(note.volume)*(note.gain||1)*(note.instrument==="choir"?.3:1);
        const end=note.start+note.duration;
        gain.gain.setValueAtTime(0,note.start);gain.gain.linearRampToValueAtTime(level,note.start+.005);gain.gain.setValueAtTime(level,end);gain.gain.linearRampToValueAtTime(0,end+.08);
        source.connect(gain).connect(ctx.destination);source.start(note.start);source.stop(end+.1);
      }
      const result=await ctx.startRendering();let peak=0,sum=0;
      for(let c=0;c<2;c++)for(const n of result.getChannelData(c)){if(!Number.isFinite(n))throw Error("Invalid PCM");peak=Math.max(peak,Math.abs(n));sum+=n*n;}
      if(peak<.001)throw Error("Silent render");
      const pcm=new Int16Array(result.length*2),scale=.85/peak;
      for(let i=0;i<result.length;i++)for(let c=0;c<2;c++)pcm[i*2+c]=Math.round(Math.max(-1,Math.min(1,result.getChannelData(c)[i]*scale))*32767);
      const bytes=new Uint8Array(pcm.buffer);let binary="";for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
      return {pcm:btoa(binary),peak,rms:Math.sqrt(sum/(result.length*2)),frames:result.length};
    },{root,notes,guide,base});
    const pcm=Buffer.from(rendered.pcm,"base64"),header=Buffer.alloc(44);
    header.write("RIFF",0);header.writeUInt32LE(36+pcm.length,4);header.write("WAVEfmt ",8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(48000,24);header.writeUInt32LE(192000,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write("data",36);header.writeUInt32LE(pcm.length,40);
    await writeFile(resolve(output,guide?"guitar-with-vocal-guide.wav":"guitar-only.wav"),Buffer.concat([header,pcm]));
    console.log(JSON.stringify({guide,peak:rendered.peak,rms:rendered.rms,frames:rendered.frames}));
  }
  if(errors.length)throw Error(errors.join("\n"));
} catch(error){if(browser)await captureFailure(browser,error);throw error;}
finally{if(browser)await closeBrowser(browser);server.kill();previewServer.stop();}
