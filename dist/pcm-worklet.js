// SPDX-License-Identifier: GPL-3.0-or-later
class PCMInput extends AudioWorkletProcessor {
 constructor(){super();this.buffer=new Float32Array(Math.round(sampleRate*.1));this.used=0;this.start=0;this.nextFrame=null;this.paddedFrames=0;this.port.onmessage=()=>{this.used=0;this.nextFrame=null;this.paddedFrames=0}}
 append(mono,frame,padded=false){
  if(!this.used)this.start=frame/sampleRate;
  this.buffer[this.used++]=mono;if(padded)this.paddedFrames++;
  if(this.used===this.buffer.length){
   const pcm=this.buffer;this.port.postMessage({pcm,start:this.start,paddedFrames:this.paddedFrames},[pcm.buffer]);
   this.buffer=new Float32Array(Math.round(sampleRate*.1));this.used=0;this.paddedFrames=0;
  }
 }
 process(inputs,outputs){
  const channels=inputs[0]||[];
  // Empty inputs occupy their clock time. Chrome can also skip entire callbacks
  // around suspend/resume: bridge at most one packet with explicit silence.
  // Larger clock jumps discard the partial packet and remain real discontinuities.
  const length=channels[0]?.length||outputs?.[0]?.[0]?.length||128;
  if(this.nextFrame!==null&&currentFrame!==this.nextFrame){
   const gap=currentFrame-this.nextFrame;
   if(gap>0&&gap<=this.buffer.length)for(let frame=this.nextFrame;frame<currentFrame;frame++)this.append(0,frame,true);
   else{this.used=0;this.paddedFrames=0;}
  }
  for(let i=0;i<length;i++){
   let mono=0;for(const channel of channels)mono+=channel[i]/channels.length;
   this.append(mono,currentFrame+i);
  }
  this.nextFrame=currentFrame+length;
  // Default output is silence: analysis never monitors the microphone.
  return true;
 }
}
registerProcessor('pcm-input',PCMInput);
