// SPDX-License-Identifier: GPL-3.0-or-later
// Streaming WebRTC/libfvad adapter. The vendored binary's notices accompany it.
(function(scope){
 class SpeechDetector {
  constructor(lib,rate){
   if(!Number.isFinite(rate)||rate<8000||rate>192000)throw Error('Invalid speech sample rate');
   this.lib=lib;this.rate=rate;this.native=[8000,16000,32000,48000].includes(rate);this.outputRate=this.native?rate:16000;this.handle=lib.fvad_new();
   if(!this.handle)throw Error('Speech detector allocation failed');
   if(lib.fvad_set_mode(this.handle,0)<0||lib.fvad_set_sample_rate(this.handle,this.outputRate)<0){this.dispose();throw Error('Speech detector configuration failed');}
   this.samples=[];this.origin=null;this.lastEnd=null;this.sampleIndex=0;this.input=new Float32Array(0);this.inputBase=0;this.nextOutput=0;
   this.frameSize=this.outputRate/100;this.pointer=lib.malloc(this.frameSize*2);if(!this.pointer){this.dispose();throw Error('Speech frame allocation failed');}
  }
  push(pcm,start){
   if(!this.handle||!(pcm instanceof Float32Array)||!Number.isFinite(start)||pcm.some(x=>!Number.isFinite(x)))throw Error('Invalid speech input');
   if(this.lastEnd!==null&&Math.abs(start-this.lastEnd)>1/this.rate+1e-7)throw Error('Discontinuous speech input');
   if(this.origin===null)this.origin=start;this.lastEnd=start+pcm.length/this.rate;
   if(this.native){for(const sample of pcm)this.samples.push(sample);}
   else {
    const next=new Float32Array(this.input.length+pcm.length);next.set(this.input);next.set(pcm,this.input.length);this.input=next;
    // Windowed-sinc anti-aliasing, centred on an absolute output grid. Keep
    // About 0.73 ms of source lookahead; packet boundaries cannot alter samples.
    const radius=Math.ceil(32*this.rate/44100),cutoff=Math.min(.45,7200/this.rate),end=this.inputBase+this.input.length;
    while(this.nextOutput*this.rate/16000+radius<end){
     const position=this.nextOutput*this.rate/16000,centre=Math.floor(position);let value=0,weight=0;
     for(let i=centre-radius;i<=centre+radius;i++){
      const d=i-position;if(Math.abs(d)>radius)continue;const x=2*cutoff*d;
      const w=2*cutoff*(Math.abs(x)<1e-12?1:Math.sin(Math.PI*x)/(Math.PI*x))*(.42+.5*Math.cos(Math.PI*d/radius)+.08*Math.cos(2*Math.PI*d/radius));
      const at=i-this.inputBase;value+=(at>=0&&at<this.input.length?this.input[at]:0)*w;weight+=w;
     }
     this.samples.push(value/weight);this.nextOutput++;
    }
    const discard=Math.max(0,Math.floor(this.nextOutput*this.rate/16000)-radius-this.inputBase);this.input=this.input.slice(discard);this.inputBase+=discard;
   }
   const decisions=[];let consumed=0;while(this.samples.length-consumed>=this.frameSize){
    const data=new Int16Array(this.lib.memory.buffer,this.pointer,this.frameSize);
    for(let i=0;i<this.frameSize;i++){const v=Math.max(-1,Math.min(1,this.samples[consumed+i]));data[i]=v<0?v*32768:v*32767;}
    const speech=this.lib.fvad_process(this.handle,this.pointer,this.frameSize);if(speech<0)throw Error('Speech frame rejected');
    decisions.push({time:this.origin+(this.sampleIndex+this.frameSize/2)/this.outputRate,speech:speech===1});this.sampleIndex+=this.frameSize;consumed+=this.frameSize;
   }
   this.samples.splice(0,consumed);return decisions;
  }
  dispose(){if(this.pointer){this.lib.free(this.pointer);this.pointer=0}if(this.handle){this.lib.fvad_free(this.handle);this.handle=0}}
 }
 const api={SpeechDetector};if(typeof module==='object'&&module.exports)module.exports=api;else scope.SpeechDetector=SpeechDetector;
})(typeof self==='object'?self:globalThis);
