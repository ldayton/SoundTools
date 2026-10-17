// SPDX-License-Identifier: GPL-3.0-or-later
// Advance by 100 ms, retaining one effective Gaussian window on each side.
(function(scope){
 class PraatStream {
  constructor({client,sampleRate,onFrames,onError,settings=()=>({})}){Object.assign(this,{client,sampleRate,onFrames,onError,settings});this.generation=0;this.busy=false;this.closed=false;this.reset()}
  reset(){this.generation++;this.pending=new Float32Array(0);this.start=null;this.lastEnd=null}
  push(pcm,start){
   if(this.closed)return;
   if(this.lastEnd!==null&&Math.abs(start-this.lastEnd)>2/this.sampleRate)this.reset();
   this.lastEnd=start+pcm.length/this.sampleRate;
   if(this.start===null)this.start=start;
   const next=new Float32Array(this.pending.length+pcm.length);next.set(this.pending);next.set(pcm,this.pending.length);this.pending=next;
   // Bound latency if a device is too slow; keep an honest gap in timestamps.
   if(this.pending.length>this.sampleRate*.5){this.reset();this.pending=pcm.slice();this.start=start;this.lastEnd=start+pcm.length/this.sampleRate}
   this.drain();
  }
  async drain(){
   const settings=this.settings(),windowSeconds=settings.windowSeconds||.025;
   const context=settings.windowShape==='hann'?windowSeconds/2:windowSeconds;
   const margin=settings.analysisFlags?Math.max(context,.05):context;
   const hop=settings.timeStep||.005;
   let steps=Math.max(1,Math.floor(.1/hop));
   while(steps>1&&Math.abs(steps*hop*this.sampleRate-Math.round(steps*hop*this.sampleRate))>1e-6)steps--;
   const duration=steps*hop;
   const length=Math.round(this.sampleRate*(duration+2*margin)),advance=Math.round(this.sampleRate*duration);
   if(this.closed||this.busy||this.pending.length<length)return;
   const generation=this.generation,start=this.start,pcm=this.pending.slice(0,length);
   this.pending=this.pending.slice(advance);this.start+=advance/this.sampleRate;this.busy=true;
   try{
    const result=await this.client.analyse({pcm,sampleRate:this.sampleRate,windowSeconds:.025,timeStep:.005,frequencyStep:20,...settings,firstCentre:margin},{transfer:true});
    if(!this.closed&&generation===this.generation){
     // Right boundary belongs to the following block. Each centre appears once.
     const frames=[];for(let i=0;i<result.frames;i++){const local=result.firstTime+i*result.timeStep;if(local>=margin+duration-1e-7)break;if(local<margin-1e-7)continue;frames.push({time:start+local,power:result.power.slice(i*result.bins,(i+1)*result.bins)})}
     result.features=(result.features||[]).filter(f=>f.time>=margin-1e-6&&f.time<margin+duration-1e-6).map(f=>({...f,time:start+f.time}));
     this.onFrames(frames,result);
    }
   }catch(error){if(!this.closed&&generation===this.generation)this.onError(error)}
   finally{this.busy=false;if(!this.closed)this.drain()}
  }
  dispose(){this.closed=true;this.reset();this.client.dispose()}
 }
 if(typeof module==='object'&&module.exports)module.exports={PraatStream};else scope.PraatStream=PraatStream;
})(typeof self==='object'?self:globalThis);
