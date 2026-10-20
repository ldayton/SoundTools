/* Shared request/ownership logic: tested in Node, used unchanged by the worker. */
(function(scope){
 function createProcessor({load,now=()=>performance.now()}){
  let module=null,loading=null,busy=false,pointer=0,capacity=0;
  async function getModule(){
   if(module)return module;
   if(!loading)loading=Promise.resolve().then(load).then(m=>(module=m,m)).catch(e=>{loading=null;throw e});
   return loading;
  }
  function reset(){pointer=capacity=0;module=loading=null}
  async function handle(data){
   const started=now(),id=data?.id??null,type=data?.type||'analyse';
   if(!data||typeof data!=='object')return {id,error:'Expected a request object',code:'INVALID_REQUEST'};
   if(busy)return {id,error:'Worker is busy; wait for the prior reply',code:'BUSY'};
   if(data.batchSteps!==undefined){
    if(type!=='analyse'||!Number.isInteger(data.batchSteps)||data.batchSteps<1||data.batchSteps>4||!Number.isFinite(data.batchDuration)||data.batchDuration<=0||data.batchDuration>.101||!(data.pcm instanceof Float32Array)||!Number.isFinite(data.firstCentre)||data.firstCentre<=0)return {id,error:'Invalid batch geometry',code:'INVALID_REQUEST'};
    const advance=Math.round(data.batchDuration*data.sampleRate),length=Math.round((data.batchDuration+2*data.firstCentre)*data.sampleRate);
    if(!Number.isSafeInteger(advance)||advance<1||data.pcm.length!==length+(data.batchSteps-1)*advance)return {id,error:'Invalid batch PCM length',code:'INVALID_REQUEST'};
    const batches=[];for(let i=0;i<data.batchSteps;i++){
     const {batchSteps,batchDuration,...request}=data;
     const result=await handle({...request,pcm:data.pcm.subarray(i*advance,i*advance+length)});
     if(result.error)return result;batches.push({...result,offset:i*data.batchDuration});
    }
    return {id,batches};
   }
   if(!['init','analyse','lpc','dispose'].includes(type))return {id,error:'Unknown request type',code:'INVALID_REQUEST'};
   if(type==='dispose'){
    if(module){if(pointer)module._free(pointer);module._sg_release();module._sg_lpc_release()}
    reset();return {id,disposed:true};
   }
   const {pcm,sampleRate,windowSeconds=.025,maximumFrequency=3500,timeStep=.005,frequencyStep=20}=data;
   if(['analyse','lpc'].includes(type)&&(!(pcm instanceof Float32Array)||pcm.length<2||pcm.length>1920000||!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000))return {id,error:'Expected bounded float PCM and an 8–192 kHz sample rate',code:'INVALID_REQUEST'};
   busy=true;
   let stage='load';
   try{
    const loadStart=now(),m=await getModule(),loadMs=now()-loadStart;
    if(type==='init')return {id,ready:true,loadMs,heapBytes:m.HEAPF32.buffer.byteLength};
    stage='analysis';
    const inputStart=now();
    if(pcm.byteLength>capacity){
     const next=m._malloc(pcm.byteLength);if(!next)throw new Error('Unable to allocate input memory');
     if(pointer)m._free(pointer);pointer=next;capacity=pcm.byteLength;
    }
    // malloc/analysis can grow memory. Never retain HEAPF32 across either call.
    m.HEAPF32.set(pcm,pointer>>>2);
    const analysisStart=now(),inputCopyMs=analysisStart-inputStart;
    if(type==='lpc'){
     const {ceiling=5500,windowSeconds=.025,order=10,bins=512,preEmphasisHz=50}=data;
     if(!Number.isInteger(order)||!Number.isInteger(bins))return {id,error:'LPC order and bin count must be integers',code:'INVALID_REQUEST'};
     const count=m._sg_lpc(pointer,pcm.length,sampleRate,ceiling,windowSeconds,order,bins,preEmphasisHz);
     if(count<0)return {id,error:m.UTF8ToString(m._sg_error()),code:'ANALYSIS_ERROR'};
     const power=m.HEAPF32.slice(m._sg_lpc_power()>>>2,(m._sg_lpc_power()>>>2)+count),coefficients=m.HEAPF32.slice(m._sg_lpc_coefficients()>>>2,(m._sg_lpc_coefficients()>>>2)+order);
     return {id,method:'praat-burg',power,coefficients,gain:m._sg_lpc_gain(),analysisRate:m._sg_lpc_rate(),frequencyStep:ceiling/(count-1),firstFrequency:0,centreTime:m._sg_lpc_centre(),windowSeconds,spectrumUnits:'relative-lpc-power',timings:{loadMs,inputCopyMs,analysisMs:now()-analysisStart,totalMs:now()-started}};
    }

    const configured=(data.windowShape&&data.windowShape!=='gaussian')||data.analysisRate||data.fftPadding||data.removeDC||data.spectrumUnits==='amplitude';
    if(data.resampling&&!['praat','polyphase'].includes(data.resampling)||data.resampleQuality!==undefined&&(!Number.isInteger(data.resampleQuality)||data.resampleQuality<0||data.resampleQuality>4)||data.windowShape&&!['gaussian','hann'].includes(data.windowShape)||data.spectrumUnits&&!['density','amplitude'].includes(data.spectrumUnits))return {id,error:'Invalid analysis settings',code:'INVALID_REQUEST'};
    const status=configured?m._sg_transform(pointer,pcm.length,sampleRate,data.analysisRate||0,windowSeconds,timeStep,data.windowShape==='hann'?1:0,data.fftPadding||0,data.removeDC?1:0,data.spectrumUnits==='amplitude'?1:0,data.firstCentre||0,data.resampling==='polyphase'?1:0,data.resampleQuality??2):m._sg_analyse(pointer,pcm.length,sampleRate,windowSeconds,maximumFrequency,timeStep,frequencyStep);
    if(status!==0){return {id,error:m.UTF8ToString(m._sg_error()),code:'ANALYSIS_ERROR'}}
    const outputStart=now();let analysisMs=outputStart-analysisStart,featureMs=0;
    const frames=m._sg_frames(),bins=m._sg_bins(),base=m._sg_data()>>>2;
    // Copy, then transfer the copy. Transferring a WASM heap is incorrect.
    const power=m.HEAPF32.slice(base,base+frames*bins);
    let features=[];
    if(data.analysisFlags){
     const floor=data.pitchFloor??75,ceiling=data.pitchCeiling??600;if(!Number.isFinite(floor)||!Number.isFinite(ceiling)||floor<50||ceiling<=floor||ceiling>1200)return {id,error:'Invalid pitch analysis range',code:'INVALID_REQUEST'};
     const method=data.pitchMethod??'raw';if(!['raw','filtered'].includes(method))return {id,error:'Invalid pitch method',code:'INVALID_REQUEST'};
     if(m._sg_set_pitch_method){if(m._sg_set_pitch_method(method==='filtered'?1:0)!==0)throw Error('Pitch method selection failed');}else if(method!=='raw')throw Error('This engine does not support filtered pitch');
     const featureStart=now(),count=m._sg_features(pointer,pcm.length,sampleRate,data.analysisFlags,data.formantCeiling||5500,data.pitchFloor??75,data.pitchCeiling??600);
     featureMs=now()-featureStart;analysisMs+=featureMs;
     if(count<0)throw Error(m.UTF8ToString(m._sg_error()));
     const base=m._sg_features_data()>>>2,values=m.HEAPF32.slice(base,base+count*10);
     for(let i=0;i<values.length;i+=10)features.push({time:values[i],formants:Array.from(values.subarray(i+1,i+4)),bandwidths:Array.from(values.subarray(i+4,i+7)),pitch:values[i+7],intensity:values[i+8],strength:values[i+9]});
    }
    return {id,spectrumUnits:data.spectrumUnits||'density',features,frames,bins,firstTime:m._sg_first_time(),timeStep:m._sg_time_step(),firstFrequency:m._sg_first_frequency(),frequencyStep:m._sg_frequency_step(),power,heapBytes:m.HEAPF32.buffer.byteLength,timings:{loadMs,inputCopyMs,analysisMs,featureMs,outputCopyMs:now()-outputStart-featureMs,totalMs:now()-started}};
   }catch(e){
    if(stage==='analysis')reset(); // A trap/abort poisons the instance; recreate it next time.
    return {id,error:e?.message||String(e),code:stage==='load'?'LOAD_FAILED':'RUNTIME_ERROR'};
   }finally{busy=false}
  }
  return {handle};
 }
 if(typeof module==='object'&&module.exports)module.exports={createProcessor};
 else scope.PraatProcessor={createProcessor};
})(typeof self==='object'?self:globalThis);
