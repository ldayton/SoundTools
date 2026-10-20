// SPDX-License-Identifier: GPL-3.0-or-later
// Causal polyphase resampling and the upstream Silero ONNX state/context protocol.
(function(scope){
 function gcd(a,b){while(b){const r=a%b;a=b;b=r}return a}
 function i0(x){let sum=1,term=1;for(let k=1;k<40;k++){term*=x*x/(4*k*k);sum+=term;if(term<sum*1e-15)break}return sum}
 class Resampler{
  constructor(rate){
   if(!Number.isInteger(rate)||rate<8000||rate>192000)throw Error('Invalid neural sample rate');
   const g=gcd(rate,16000);this.up=16000/g;this.down=rate/g;this.half=10*Math.max(this.up,this.down);if(this.half>100000)throw Error('Unsupported neural sample rate');
   this.input=new Float32Array(0);this.base=0;this.next=0;this.phases=new Map();
   this.filter=new Float64Array(this.half*2+1);let sum=0;const max=Math.max(this.up,this.down),den=i0(5);
   for(let n=0;n<this.filter.length;n++){const d=n-this.half,x=d/max,w=i0(5*Math.sqrt(Math.max(0,1-(d/this.half)**2)))/den;const v=(x===0?1:Math.sin(Math.PI*x)/(Math.PI*x))/max*w;this.filter[n]=v;sum+=v}
   for(let n=0;n<this.filter.length;n++)this.filter[n]*=this.up/sum;
  }
  push(pcm){
   if(this.up===1&&this.down===1)return pcm.slice();
   const joined=new Float32Array(this.input.length+pcm.length);joined.set(this.input);joined.set(pcm,this.input.length);this.input=joined;const end=this.base+joined.length,out=[];
   while(this.next*this.down+this.half<end*this.up){
    const pos=this.next*this.down,centre=Math.floor(pos/this.up),phase=pos%this.up;let taps=this.phases.get(phase);
    if(!taps){taps=[];for(let offset=Math.ceil((phase-this.half)/this.up);offset<=Math.floor((phase+this.half)/this.up);offset++)taps.push([offset,this.filter[this.half+phase-offset*this.up]]);this.phases.set(phase,taps)}
    let value=0;for(const [offset,weight] of taps){const at=centre+offset-this.base;if(at>=0&&at<joined.length)value+=joined[at]*weight}out.push(value);this.next++;
   }
   const discard=Math.max(0,Math.floor((this.next*this.down-this.half)/this.up)-this.base);this.input=this.input.slice(discard);this.base+=discard;return Float32Array.from(out);
  }
 }
 class NeuralDetector{
  constructor(rate,run){this.rate=rate;this.run=run;this.resampler=new Resampler(rate);this.pending=new Float32Array(0);this.state=new Float32Array(256);this.context=new Float32Array(64);this.origin=null;this.lastEnd=null;this.frames=0}
  async push(pcm,start){
   if(!(pcm instanceof Float32Array)||!Number.isFinite(start)||pcm.some(v=>!Number.isFinite(v)))throw Error('Invalid neural PCM');
   if(this.lastEnd!==null&&Math.abs(start-this.lastEnd)>1/this.rate+1e-7)throw Error('Discontinuous neural PCM');if(this.origin===null)this.origin=start;this.lastEnd=start+pcm.length/this.rate;
   const values=this.resampler.push(pcm),all=new Float32Array(this.pending.length+values.length);all.set(this.pending);all.set(values,this.pending.length);this.pending=all;let used=0;const flags=[];
   while(all.length-used>=512){const block=all.subarray(used,used+512),input=new Float32Array(576);input.set(this.context);input.set(block,64);const result=await this.run(input,this.state);if(!Number.isFinite(result.probability)||result.probability<0||result.probability>1||result.state.length!==256)throw Error('Invalid neural result');this.state=new Float32Array(result.state);this.context=block.slice(-64);flags.push({start:this.origin+this.frames*512/16000,end:this.origin+(this.frames+1)*512/16000,time:this.origin+(this.frames*512+256)/16000,speech:result.probability>=.3,probability:result.probability});this.frames++;used+=512;}
   this.pending=all.slice(used);return flags;
  }
 }
 const api={Resampler,NeuralDetector};if(typeof module==='object'&&module.exports)module.exports=api;else scope.NeuralSpeech=api;
})(typeof self==='object'?self:globalThis);
