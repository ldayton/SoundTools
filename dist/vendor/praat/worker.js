/* Lazy load once per persistent worker; no work is performed on the UI thread. */
const glueVersion=new URL(self.location.href).searchParams.get('v');
importScripts('processor.js'+(glueVersion?'?v='+encodeURIComponent(glueVersion):''),'speech-detector.js');
let speechModule=null,speechDetector=null,speechSession=null;
async function speech(data){
 if(!speechModule)speechModule=fetch(new URL('speech-vad.wasm',self.location.href)).then(r=>{if(!r.ok)throw Error('Speech engine unavailable');return WebAssembly.instantiateStreaming(r)}).then(r=>r.instance.exports).catch(e=>{speechModule=null;throw e});
 const lib=await speechModule;
 if(speechSession!==data.session||speechDetector?.rate!==data.sampleRate||speechDetector?.lastEnd!==null&&speechDetector?.lastEnd!==undefined&&Math.abs(data.start-speechDetector.lastEnd)>1/data.sampleRate+1e-7){speechDetector?.dispose();speechDetector=new SpeechDetector(lib,data.sampleRate);speechSession=data.session;}
 const start=performance.now(),decisions=speechDetector.push(data.pcm,data.start);return {id:data.id,decisions,ms:performance.now()-start};
}
const profile=new URL(self.location.href).searchParams.get('profile')||'baseline';
const directory=['release','size','debug'].includes(profile)?'build-'+profile:'build';
const base=new URL(directory+'/',self.location.href);
let compiled=null,compiledVersion=null;
const processor=PraatProcessor.createProcessor({load:async()=>{
 const response=await fetch(new URL('manifest.json',base),{cache:'no-cache'});
 if(!response.ok)throw new Error('Build manifest request failed: '+response.status);
 const manifest=await response.json();
 const version=name=>{
  const hash=manifest.assets?.[name]?.sha256;
  if(!/^[a-f0-9]{64}$/.test(hash||''))throw new Error('Invalid build manifest');
  const url=new URL(name,base);url.searchParams.set('v',hash);return url.href;
 };
 // Version both files from one manifest to avoid stale glue/new WASM mismatches.
 importScripts(version('praat-spectrogram.js'));
 const wasmURL=version('praat-spectrogram.wasm');
 if(compiledVersion!==wasmURL){compiled=null;compiledVersion=wasmURL}
 if(!compiled)compiled=(async()=>{
  const response=await fetch(wasmURL);
  if(!response.ok)throw new Error('WASM download failed: HTTP '+response.status);
  const mime=(response.headers.get('Content-Type')||'').split(';')[0].trim();
  if(mime!=='application/wasm')throw new Error('Serve WASM with Content-Type: application/wasm (received '+mime+')');
  return WebAssembly.compileStreaming(response);
 })().catch(error=>{compiled=null;throw error});
 const wasmModule=await compiled;
 return PraatSpectrogram({locateFile:name=>version(name),instantiateWasm:(imports,receive)=>{
  const instance=new WebAssembly.Instance(wasmModule,imports);
  receive(instance,wasmModule);return instance.exports;
 }});
}});
self.onmessage=async({data})=>{
 let reply;try{reply=data.type==='speech'?await speech(data):await processor.handle(data)}catch(error){reply={id:data.id,error:error.message}};
 self.postMessage(reply,reply.batches?reply.batches.map(batch=>batch.power.buffer):reply.power?[reply.power.buffer]:[]);
};
