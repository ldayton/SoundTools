// SPDX-License-Identifier: GPL-3.0-or-later
// Advance by 100 ms, retaining one effective Gaussian window on each side.
(function(scope){
 class PraatStream {
  constructor({client,sampleRate,onFrames,onError,settings=()=>({}),onEvent=()=>{}}){Object.assign(this,{client,sampleRate,onFrames,onError,settings,onEvent});this.generation=0;this.busy=false;this.closed=false;this.reset()}
  reset(){this.generation++;this.pending=new Float32Array(0);this.start=null;this.lastEnd=null}
  filterPadding(settings=this.settings()){
   const target=settings.analysisRate||0;
   if(settings.resampling!=='polyphase'||!target||target===this.sampleRate)return 0;
   const gcd=(a,b)=>b?gcd(b,a%b):a,quantum=this.sampleRate/gcd(this.sampleRate,target);
   const half=[80,96,128,192,320][settings.resampleQuality??2];
   return Math.ceil(half/quantum)*quantum;
  }
  push(pcm,start){
   if(this.closed)return;
   if(this.lastEnd!==null&&Math.abs(start-this.lastEnd)>2/this.sampleRate){this.onEvent('captureDiscontinuities',{expected:this.lastEnd,actual:start,gapMs:(start-this.lastEnd)*1000});this.reset();}
   this.lastEnd=start+pcm.length/this.sampleRate;
   if(this.start===null){
    const padding=this.filterPadding();this.pending=new Float32Array(padding);this.start=start-padding/this.sampleRate;
   }
   const next=new Float32Array(this.pending.length+pcm.length);next.set(this.pending);next.set(pcm,this.pending.length);this.pending=next;
   // Bound latency if a device is too slow; keep an honest gap in timestamps.
   if(this.pending.length>this.sampleRate*.5){this.onEvent('backlogResets');this.reset();const padding=this.filterPadding();this.pending=new Float32Array(padding+pcm.length);this.pending.set(pcm,padding);this.start=start-padding/this.sampleRate;this.lastEnd=start+pcm.length/this.sampleRate}
   this.drain();
  }
  async drain(){
   const settings=this.settings(),windowSeconds=settings.windowSeconds||.025;
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
   this.pending=this.pending.slice(advance);this.start+=advance/this.sampleRate;this.busy=true;
   try{
    const requestStarted=performance.now();
    const result=await this.client.analyse({pcm,sampleRate:this.sampleRate,windowSeconds:.025,timeStep:.005,frequencyStep:20,...settings,firstCentre:margin},{transfer:true});
    if(!this.closed&&generation===this.generation){
     // Right boundary belongs to the following block. Each centre appears once.
     const frames=[];for(let i=0;i<result.frames;i++){const local=result.firstTime+i*result.timeStep;if(local>=margin+duration-1e-7)break;if(local<margin-1e-7)continue;frames.push({time:start+local,power:result.power.slice(i*result.bins,(i+1)*result.bins)})}
     result.features=(result.features||[]).filter(f=>f.time>=margin-1e-6&&f.time<margin+duration-1e-6).map(f=>({...f,time:start+f.time}));
     result.timings={...result.timings,workerRoundTripMs:performance.now()-requestStarted};result.pendingAudioMs=this.pending.length/this.sampleRate*1000;
     this.onFrames(frames,result);
    }
   }catch(error){if(!this.closed&&generation===this.generation)this.onError(error)}
   finally{this.busy=false;if(!this.closed)this.drain()}
  }
  dispose(){this.closed=true;this.reset();this.client.dispose()}
 }
 if(typeof module==='object'&&module.exports)module.exports={PraatStream};else scope.PraatStream=PraatStream;
})(typeof self==='object'?self:globalThis);
