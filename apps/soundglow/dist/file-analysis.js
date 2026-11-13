// SPDX-License-Identifier: GPL-3.0-or-later
// File inspection owns an independent worker; browsing never resets live playback.
(function(scope){
 class FileAnalysis {
  constructor(workerURL,reader){this.workerURL=workerURL;this.reader=reader;this.generation=0;this.client=null;}
  cancel(){this.generation++;this.client?.dispose();this.client=null;}
  clear(){this.cancel();}
  async analyse(blob,start,end,settings,progress){
   this.cancel();const generation=this.generation,current=()=>generation===this.generation;
   const rate=settings.maximumFrequency>8000?48000:16000;
   const client=new PraatClient({workerURL:this.workerURL});this.client=client;await client.init();
   let displayHop=Math.max(settings.timeStep,(end-start)/1200);
   const frames=[],features=[],span=end-start,hop=Math.min(.1,Math.ceil(displayHop*rate)/rate),margin=Math.max(.12,settings.windowSeconds*2);
   let geometry,nextSpectrum=start,nextFeature=start;const featureHop=Math.max(.01,span/10000),session=crypto.randomUUID();
   try{
    for(let from=start;from<end-1e-7;from+=.5){
     if(!current())return null;
     const until=Math.min(end,from+.5),origin=from-margin,length=Math.ceil((until-from+2*margin)*rate),pcm=new Float32Array(length);
     const buffer=await this.reader.read(blob,origin,until+margin,rate,current);if(!current())return null;
     for(let i=0;i<length&&i<buffer.length;i++)for(let channel=0;channel<buffer.numberOfChannels;channel++)pcm[i]+=buffer.getChannelData(channel)[i]/buffer.numberOfChannels;
     const speech=await client.analyse({type:'speech',session,neural:false,pcm:pcm.slice(),start:origin,sampleRate:rate},{transfer:true});
     const result=await client.analyse({...settings,pcm,sampleRate:rate,analysisRate:settings.analysisRate||0,timeStep:hop,firstCentre:margin,fftPadding:settings.fftPadding,analysisFlags:settings.analysisFlags|6,pitchFloor:50,pitchCeiling:1200},{transfer:true});
     if(!current())return null;geometry=result;
     // Reserve room for wide FFTs without silently dropping the start of a view.
     displayHop=Math.max(displayHop,span/Math.max(1,Math.floor(24*1024*1024/(result.bins*4))));
     for(let i=0;i<result.frames;i++){const time=origin+result.firstTime+i*result.timeStep;if(time>=from-1e-6&&time<until-1e-6&&time>=nextSpectrum-1e-6){frames.push({time,power:result.power.slice(i*result.bins,(i+1)*result.bins)});nextSpectrum=time+displayHop-hop*.1;}}
     for(const f of result.features){const time=origin+f.time;if(time>=from-1e-6&&time<until-1e-6&&time>=nextFeature-1e-6){features.push({...f,time,speech:speech.decisions.some(d=>d.speech&&d.time>=time-.1&&d.time<=time+.03)});nextFeature=time+featureHop-.001;}}
     progress?.((until-start)/span);
    }
    return {frames,features,geometry,timeStep:Math.max(hop,displayHop),sampleRate:rate};
   }finally{client.dispose();if(this.client===client)this.client=null;}
  }
 }
 scope.SoundglowFileAnalysis=FileAnalysis;
})(window);
