// SPDX-License-Identifier: GPL-3.0-or-later
// Advance by 100 ms, retaining one effective Gaussian window on each side.
(function(scope){
 class PraatStream {
  constructor({client,sampleRate,onFrames,onError,settings=()=>({}),onEvent=()=>{},onReconfigured=()=>{},onReconfigureError=()=>{},retain=true}){Object.assign(this,{client,sampleRate,onFrames,onError,settings,onEvent,onReconfigured,onReconfigureError});this.retain=retain;this.activeSettings={...settings()};this.raw=[];this.rawBytes=0;this.revision=0;this.requests=[];this.requestBusy=false;this.generation=0;this.busy=false;this.closed=false;this.reset()}
  reset({keepHistory=false}={}){const rebuilding=!!this.rebuild;this.revision++;this.rebuild?.dispose();this.rebuild=null;if(!keepHistory){this.raw=[];this.rawBytes=0;}this.generation++;this.backlogged=false;this.pending=new Float32Array(0);this.start=null;this.lastEnd=null;if(rebuilding&&!this.closed)this.onReconfigureError(Error('Audio discontinuity interrupted the settings update'))}
  filterPadding(settings=this.activeSettings){
   const target=settings.analysisRate||0;
   if(settings.resampling!=='polyphase'||!target||target===this.sampleRate)return 0;
   const gcd=(a,b)=>b?gcd(b,a%b):a,quantum=this.sampleRate/gcd(this.sampleRate,target);
   const half=[80,96,128,192,320][settings.resampleQuality??2];
   return Math.ceil(half/quantum)*quantum;
  }
  push(pcm,start){
   if(this.closed)return;
   if(this.lastEnd!==null&&Math.abs(start-this.lastEnd)>2/this.sampleRate){this.onEvent('captureDiscontinuities',{expected:this.lastEnd,actual:start,gapMs:(start-this.lastEnd)*1000});this.reset({keepHistory:true});}
   if(this.retain){
    this.raw.push({pcm,start});this.rawBytes+=pcm.byteLength;
    while(this.raw.length&&(this.rawBytes>24*1024*1024||this.raw[0].start<start-32)){this.rawBytes-=this.raw.shift().pcm.byteLength;}
   }
   this.lastEnd=start+pcm.length/this.sampleRate;
   if(this.start===null){
    const padding=this.filterPadding();this.pending=new Float32Array(padding);this.start=start-padding/this.sampleRate;
   }
   const next=new Float32Array(this.pending.length+pcm.length);next.set(this.pending);next.set(pcm,this.pending.length);this.pending=next;
   // UI stalls can deliver several capture packets in one burst. Let a fast
   // worker catch up without dropping audio; still bound sustained overload.
   if(this.pending.length>this.sampleRate*.5&&!this.backlogged){this.backlogged=true;this.onEvent('backlogHighWater',{pendingAudioMs:this.pending.length/this.sampleRate*1000});}
   if(this.pending.length>this.sampleRate*2){this.onEvent('backlogResets');this.reset({keepHistory:true});const padding=this.filterPadding();this.pending=new Float32Array(padding+pcm.length);this.pending.set(pcm,padding);this.start=start-padding/this.sampleRate;this.lastEnd=start+pcm.length/this.sampleRate}
   return this.drain();
  }
  async drain(){
   const settings=this.activeSettings,windowSeconds=settings.windowSeconds||.025;
   const context=settings.windowShape==='hann'?windowSeconds/2:windowSeconds;
   // Retain FIR context on both sides, aligned to both sample-rate grids.
   // The initial left context is zero padding; it does not shift frame timestamps.
   const margin=(settings.analysisFlags?Math.max(context,.05):context)+this.filterPadding(settings)/this.sampleRate;
   const hop=settings.timeStep||.005;
   let steps=Math.max(1,Math.floor(.1/hop));
   while(steps>1&&Math.abs(steps*hop*this.sampleRate-Math.round(steps*hop*this.sampleRate))>1e-6)steps--;
   const duration=steps*hop;
   const length=Math.round(this.sampleRate*(duration+2*margin)),advance=Math.round(this.sampleRate*duration);
   if(this.closed||this.busy||this.pending.length<length)return;
   const generation=this.generation,start=this.start,pcm=this.pending.slice(0,length);
   this.pending=this.pending.slice(advance);if(this.pending.length<=this.sampleRate*.5)this.backlogged=false;this.start+=advance/this.sampleRate;this.busy=true;
   try{
    const requestStarted=performance.now();
    const result=await this.request({pcm,sampleRate:this.sampleRate,windowSeconds:.025,timeStep:.005,frequencyStep:20,...settings,firstCentre:margin},{transfer:true});
    if(!this.closed&&generation===this.generation){
     // Right boundary belongs to the following block. Each centre appears once.
     const frames=[];for(let i=0;i<result.frames;i++){const local=result.firstTime+i*result.timeStep;if(local>=margin+duration-1e-7)break;if(local<margin-1e-7)continue;frames.push({time:start+local,power:result.power.slice(i*result.bins,(i+1)*result.bins)})}
     result.features=(result.features||[]).filter(f=>f.time>=margin-1e-6&&f.time<margin+duration-1e-6).map(f=>({...f,time:start+f.time}));
     result.timings={...result.timings,workerRoundTripMs:performance.now()-requestStarted};result.pendingAudioMs=this.pending.length/this.sampleRate*1000;
     result.analysisSettings={...settings};this.onFrames(frames,result);
    }
   }catch(error){if(!this.closed&&generation===this.generation)this.onError(error)}
   finally{this.busy=false;if(!this.closed)await this.drain()}
  }
  // One worker owns all WASM calls. Live work goes ahead of replay work.
  request(data,options,background=false,isCurrent=()=>true){
   return new Promise((resolve,reject)=>{this.requests.push({data,options,background,isCurrent,resolve,reject});this.serve()});
  }
  async serve(){
   if(this.requestBusy)return;this.requestBusy=true;
   try{while(this.requests.length){
    const live=this.requests.findIndex(r=>!r.background),job=this.requests.splice(live<0?0:live,1)[0];
    if(!job.isCurrent()){job.reject(Error('Superseded analysis settings'));continue;}
    try{job.resolve(await this.client.analyse(job.data,job.options))}catch(error){job.reject(error)}
    // Give the live stream a chance to enqueue its next block before choosing.
    await Promise.resolve();await Promise.resolve();
   }}finally{this.requestBusy=false}
  }
  async reconfigure(settings=this.settings()){
   const revision=++this.revision;this.rebuild?.dispose();this.rebuild=null;
   const requested={...settings};
   if(JSON.stringify(requested)===JSON.stringify(this.activeSettings))return;
   if(!this.raw.length){this.activeSettings=requested;this.generation++;return;}
   const groups=[];let failure,bytes=0;const started=performance.now();
   const replay=new PraatStream({retain:false,sampleRate:this.sampleRate,settings:()=>requested,
    client:{analyse:(data,options)=>this.request(data,options,true,()=>!this.closed&&revision===this.revision),dispose(){}},
    onFrames:(frames,result)=>{
     delete result.power;groups.push({frames,result});bytes+=frames.reduce((sum,frame)=>sum+frame.power.byteLength,0);
     while(groups.length>1&&bytes>32*1024*1024){const old=groups.shift();bytes-=old.frames.reduce((sum,frame)=>sum+frame.power.byteLength,0);}
    },onError:error=>{failure=error}});
   this.rebuild=replay;
   let cursor=this.raw[0].start;
   this.onEvent('configurationStarted',{revision});
   try{
    for(;;){
     if(this.closed||revision!==this.revision)return;
     if(performance.now()-started>15000)throw Error('Settings update took too long; keeping the current analysis');
     const block=this.raw.find(block=>block.start+block.pcm.length/this.sampleRate>cursor+1e-7);
     if(!block)break;
     if(block.start>cursor+2/this.sampleRate){replay.reset();cursor=block.start;} // Preserve real capture gaps, including microphone pause.
     const offset=Math.max(0,Math.round((cursor-block.start)*this.sampleRate)),length=Math.min(block.pcm.length-offset,Math.round(this.sampleRate*.1));
     await replay.push(block.pcm.slice(offset,offset+length),block.start+offset/this.sampleRate);
     cursor=block.start+(offset+length)/this.sampleRate;
     if(failure)throw failure;
    }
    if(this.closed||revision!==this.revision)return;
    // Commit the reconstructed history and processing cursor together. An old
    // in-flight request may finish, but its generation can no longer publish.
    this.generation++;this.activeSettings=requested;this.pending=replay.pending;this.start=replay.start;this.lastEnd=replay.lastEnd;
    this.rebuild=null;replay.closed=true;
    this.onReconfigured(groups);this.onEvent('configurationCommitted',{revision});
    await this.drain();
   }catch(error){if(!this.closed&&revision===this.revision){replay.dispose();this.rebuild=null;this.onReconfigureError(error);}}
  }
  dispose(){this.closed=true;this.reset();this.client.dispose()}
 }
 if(typeof module==='object'&&module.exports)module.exports={PraatStream};else scope.PraatStream=PraatStream;
})(typeof self==='object'?self:globalThis);
