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
   if(!['init','analyse','dispose'].includes(type))return {id,error:'Unknown request type',code:'INVALID_REQUEST'};
   if(type==='dispose'){
    if(module){if(pointer)module._free(pointer);module._sg_release()}
    reset();return {id,disposed:true};
   }
   const {pcm,sampleRate,windowSeconds=.025,maximumFrequency=3500,timeStep=.005,frequencyStep=20}=data;
   if(type==='analyse'&&(!(pcm instanceof Float32Array)||pcm.length<2||pcm.length>1920000||!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000))return {id,error:'Expected bounded float PCM and an 8–192 kHz sample rate',code:'INVALID_REQUEST'};
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
    if(m._sg_analyse(pointer,pcm.length,sampleRate,windowSeconds,maximumFrequency,timeStep,frequencyStep)!==0){return {id,error:m.UTF8ToString(m._sg_error()),code:'ANALYSIS_ERROR'}}
    const outputStart=now(),analysisMs=outputStart-analysisStart;
    const frames=m._sg_frames(),bins=m._sg_bins(),base=m._sg_data()>>>2;
    // Copy, then transfer the copy. Transferring a WASM heap is incorrect.
    const power=m.HEAPF32.slice(base,base+frames*bins);
    return {id,frames,bins,firstTime:m._sg_first_time(),timeStep:m._sg_time_step(),firstFrequency:m._sg_first_frequency(),frequencyStep:m._sg_frequency_step(),power,heapBytes:m.HEAPF32.buffer.byteLength,timings:{loadMs,inputCopyMs,analysisMs,outputCopyMs:now()-outputStart,totalMs:now()-started}};
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
