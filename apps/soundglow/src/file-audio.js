// SPDX-License-Identifier: GPL-3.0-or-later
import {Input,BlobSource,AudioBufferSink,ALL_FORMATS} from 'mediabunny';
import {Stretch} from '@soundtouchjs/core';
const MAX_BYTES=32*1024*1024;
class FileAudioReader {
 constructor(){this.inputs=new Map();this.generation=0;this.largestWindowBytes=0;}
 clear(){this.generation++;for(const entry of this.inputs.values())entry.then(e=>e.input?.dispose()).catch(()=>{});this.inputs.clear();}
 async open(blob){
  if(!this.inputs.has(blob))this.inputs.set(blob,(async()=>{
   const input=new Input({source:new BlobSource(blob,{maxCacheSize:2*1024*1024}),formats:ALL_FORMATS});
   try{
    const track=await input.getPrimaryAudioTrack();if(!track)throw Error('No audio track');
    const rate=await track.getSampleRate(),channels=await track.getNumberOfChannels();
    if(channels>8)throw Error('Too many audio channels');
    if(await track.canDecode())return {input,sink:new AudioBufferSink(track),rate,channels};
    const duration=await track.computeDuration();
    // Older browsers may lack WebCodecs for a native-playable format. Only
    // permit their whole-file decoder when the decoded allocation is bounded.
    if(duration*rate*channels*4>MAX_BYTES||blob.size>MAX_BYTES)throw Error('This browser cannot decode ranges of this format');
    const buffer=await new OfflineAudioContext(channels,1,rate).decodeAudioData(await blob.arrayBuffer());
    if(buffer.length*buffer.numberOfChannels*4>MAX_BYTES)throw Error('Decoded audio exceeds the memory budget');
    return {input,buffer,rate:buffer.sampleRate,channels:buffer.numberOfChannels};
   }catch(error){input.dispose();throw error;}
  })());
  return this.inputs.get(blob);
 }
 async *buffers(blob,start=0,end=Infinity){
  const entry=await this.open(blob);
  if(entry.buffer){yield {buffer:entry.buffer,timestamp:0};return;}
  yield* entry.sink.buffers(Math.max(0,start),end);
 }
 async read(blob,start,end,rate=48000,isCurrent=()=>true){
  const generation=this.generation,entry=await this.open(blob);if(!isCurrent()||generation!==this.generation)throw Error('Cancelled');
  const length=Math.max(1,Math.round((end-start)*entry.rate)),bytes=length*entry.channels*4;
  if(bytes>MAX_BYTES)throw Error('Requested audio window exceeds the memory budget');
  this.largestWindowBytes=Math.max(this.largestWindowBytes,bytes);
  const original=new AudioBuffer({length,numberOfChannels:entry.channels,sampleRate:entry.rate});
  for await(const wrapped of this.buffers(blob,start,end)){
   if(!isCurrent()||generation!==this.generation)throw Error('Cancelled');
   const offset=Math.round((wrapped.timestamp-start)*entry.rate),from=Math.max(0,-offset),count=Math.min(wrapped.buffer.length-from,length-Math.max(0,offset));
   if(count>0)for(let c=0;c<entry.channels;c++)original.getChannelData(c).set(wrapped.buffer.getChannelData(c).subarray(from,from+count),Math.max(0,offset));
  }
  if(rate===entry.rate)return original;
  const context=new OfflineAudioContext(entry.channels,Math.max(1,Math.round((end-start)*rate)),rate),source=context.createBufferSource();source.buffer=original;source.connect(context.destination);source.start();
  return context.startRendering();
 }
}
async function stretchBuffer(input,tempo,isCurrent){
 if(tempo===1)return input;
 const count=Math.max(1,Math.round(input.length/tempo));if(count*8>MAX_BYTES)throw Error('Stretched audio exceeds memory budget');
 const output=new AudioBuffer({length:count,numberOfChannels:2,sampleRate:input.sampleRate}),stretch=new Stretch({sampleRate:input.sampleRate,createBuffers:true});stretch.tempo=tempo;const ms=input.duration*1000;stretch.setStretchParameters({sequenceMs:Math.min(100,Math.max(4,ms/8)),seekWindowMs:Math.min(20,Math.max(1,ms/25)),overlapMs:Math.min(8,Math.max(.5,ms/50))});
 const left=input.getChannelData(0),right=input.getChannelData(Math.min(1,input.numberOfChannels-1));let used=0;
 for(let at=0;at<input.length+input.sampleRate&&used<count;at+=4096){
  if(!isCurrent())throw Error('Cancelled');
  const chunk=new Float32Array(8192);for(let i=0;i<4096;i++){chunk[2*i]=left[at+i]||0;chunk[2*i+1]=right[at+i]||0;}
  stretch.inputBuffer.putSamples(chunk);stretch.process();
  const frames=Math.min(stretch.outputBuffer.frameCount,count-used),samples=new Float32Array(frames*2);stretch.outputBuffer.extract(samples,0,frames);stretch.outputBuffer.receive(frames);
  for(let i=0;i<frames;i++){output.getChannelData(0)[used+i]=samples[2*i];output.getChannelData(1)[used+i]=samples[2*i+1];}used+=frames;
  if(at%32768===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 return output;
}
function fadeEdges(buffer){
 const count=Math.min(Math.round(buffer.sampleRate*.002),Math.floor(buffer.length/8));
 for(let c=0;c<buffer.numberOfChannels;c++){const samples=buffer.getChannelData(c);for(let i=0;i<count;i++){samples[i]*=i/count;samples[samples.length-i-1]*=i/count;}}
 return buffer;
}
class PassagePlayer {
 constructor(context,reader,onended){this.getContext=context;this.reader=reader;this.onended=onended;this.nodes=new Set();this.segments=[];this.active=false;this.generation=0;this.cache=null;}
 get position(){
  if(!this.active)return this.offset||0;
  const time=this.context.currentTime;
  if(this.mode==='buffer'){const elapsed=Math.max(0,time-this.when)*this.rate+this.initial;return this.loop?this.start+elapsed%(this.end-this.start):Math.min(this.end,this.start+elapsed);}
  const current=this.segments.find(s=>time>=s.when&&time<s.until);if(current)return Math.min(current.end,current.start+Math.max(0,time-current.when)*this.rate);
  return this.segments.find(s=>s.when>time)?.start??this.segments.at(-1)?.end??this.offset;
 }
 stop(){this.offset=this.position;this.active=false;this.generation++;clearTimeout(this.timer);for(const node of this.nodes){node.onended=null;try{node.stop();}catch{}node.disconnect();}this.nodes.clear();this.segments=[];this.gain?.disconnect();}
 clear(){this.stop();this.cache=null;}
 volume(value){if(this.gain)this.gain.gain.value=value;}
 async play(blob,range,offset,{loop,rate,volume,isCurrent=()=>true}){
  this.stop();const generation=this.generation,current=()=>generation===this.generation&&isCurrent();this.context=this.getContext();await this.context.resume();if(!current())return;
  this.start=range.start;this.end=range.end;this.rate=rate;this.loop=loop;this.offset=Math.max(this.start,Math.min(offset,this.end));if(this.offset>=this.end)this.offset=this.start;
  this.gain=this.context.createGain();this.gain.gain.value=volume;this.gain.connect(this.context.destination);
  const small=(this.end-this.start)*48000*8/Math.min(rate,1)<=12*1024*1024;
  if(small){
   const key=[this.start,this.end,rate].join(':');let buffer=this.cache?.blob===blob&&this.cache.key===key?this.cache.buffer:null;
   if(!buffer){buffer=fadeEdges(await stretchBuffer(await this.reader.read(blob,this.start,this.end,48000,current),rate,current));if(!current())return;this.cache={blob,key,buffer};}
   const node=this.context.createBufferSource();node.buffer=buffer;node.loop=loop;node.loopStart=0;node.loopEnd=buffer.duration;node.connect(this.gain);
   this.mode='buffer';this.when=this.context.currentTime+.025;this.initial=this.offset-this.start;this.active=true;this.nodes.add(node);
   node.onended=()=>{if(!current()||node.loop)return;this.offset=this.end;this.active=false;this.nodes.delete(node);node.disconnect();this.onended(this.end);};
   node.start(this.when,this.initial/rate);return;
  }
  // Long selections use a bounded queue. Every source ends at its scheduled
  // buffer boundary; a UI stall can cause silence, never audio outside the range.
  this.mode='queue';this.cursor=this.offset;this.queueTime=null;this.active=true;
  const fill=async()=>{
   try{
    while(current()&&this.active&&(this.queueTime===null||this.queueTime<this.context.currentTime+6)){
     if(this.cursor>=this.end-1e-7){if(!loop)break;this.cursor=this.start;}
     const start=this.cursor,end=Math.min(this.end,start+2),buffer=await stretchBuffer(await this.reader.read(blob,start,end,48000,current),rate,current);if(!current()||!this.active)return;
     const when=Math.max(this.queueTime||0,this.context.currentTime+.025),node=this.context.createBufferSource();node.buffer=buffer;node.connect(this.gain);this.nodes.add(node);
     this.segments=this.segments.filter(s=>s.until>=this.context.currentTime-.5);this.segments.push({when,until:when+buffer.duration,start,end});
     node.onended=()=>{this.nodes.delete(node);node.disconnect();if(current()&&!loop&&this.cursor>=this.end&&!this.nodes.size){this.offset=this.end;this.active=false;this.onended(this.end);}};
     node.start(when);this.queueTime=when+buffer.duration;this.cursor=end;
    }
    if(current()&&this.active)this.timer=setTimeout(fill,250);
   }catch(error){if(current()){this.stop();this.onended(this.offset,error);}}
  };
  await fill();
 }
}
window.SoundglowFileAudio={FileAudioReader,PassagePlayer,stretchBuffer,MAX_BYTES};
