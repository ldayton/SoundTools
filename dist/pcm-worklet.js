// SPDX-License-Identifier: GPL-3.0-or-later
class PCMInput extends AudioWorkletProcessor {
 constructor(){super();this.buffer=new Float32Array(Math.round(sampleRate*.1));this.used=0;this.start=0;this.port.onmessage=()=>{this.used=0}}
 process(inputs,outputs){
  const channels=inputs[0]||[];
  // A temporarily disconnected input is silence on the audio clock. Skipping
  // its quantum corrupts packet timestamps, particularly around suspend/resume.
  const length=channels[0]?.length||outputs?.[0]?.[0]?.length||128;
  for(let i=0;i<length;i++){
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
