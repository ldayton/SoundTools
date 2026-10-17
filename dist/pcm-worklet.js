// SPDX-License-Identifier: GPL-3.0-or-later
class PCMInput extends AudioWorkletProcessor {
 constructor(){super();this.buffer=new Float32Array(Math.round(sampleRate*.1));this.used=0;this.start=0;this.port.onmessage=()=>{this.used=0}}
 process(inputs){
  const channels=inputs[0];if(!channels?.length)return true;
  for(let i=0;i<channels[0].length;i++){
   if(!this.used)this.start=(currentFrame+i)/sampleRate;
   let mono=0;for(const channel of channels)mono+=channel[i]/channels.length;
   this.buffer[this.used++]=mono;
   if(this.used===this.buffer.length){const pcm=this.buffer;this.port.postMessage({pcm,start:this.start},[pcm.buffer]);this.buffer=new Float32Array(Math.round(sampleRate*.1));this.used=0}
  }
  // Default output is silence: analysis never monitors the microphone.
  return true;
 }
}
registerProcessor('pcm-input',PCMInput);
