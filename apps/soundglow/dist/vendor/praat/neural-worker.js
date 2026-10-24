// SPDX-License-Identifier: GPL-3.0-or-later
// Optional inference is isolated so model loading/compilation cannot block Praat.
importScripts('neural-detector.js');
let model,detector,key;
async function runModel(input,state){const tensors={input:new ort.Tensor('float32',input,[1,576]),state:new ort.Tensor('float32',state,[2,1,128]),sr:new ort.Tensor('int64',BigInt64Array.from([16000n]),[])},out=await model.run(tensors);const result={probability:out.output.data[0],state:new Float32Array(out.stateN.data)};for(const t of [...Object.values(tensors),...Object.values(out)])t.dispose?.();return result;}
async function load(){
 const response=await fetch('neural-manifest.json');if(!response.ok)throw Error('Speech manifest unavailable');const manifest=await response.json();
 const base=new URL('../../vendor/neural/'+manifest.version+'/',self.location.href);
 importScripts(new URL('ort.wasm.min.js',base).href);ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths=base.href;
 const weights=await fetch(new URL('silero.onnx',base));if(!weights.ok)throw Error('Speech model unavailable');const bytes=await weights.arrayBuffer();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(digest!==manifest.files['silero.onnx'].sha256)throw Error('Speech model integrity mismatch');
 model=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});await runModel(new Float32Array(576),new Float32Array(256));postMessage({type:'ready'});
}
load().catch(error=>postMessage({type:'unavailable',error:error.message}));
let queue=Promise.resolve();
self.onmessage=({data})=>{queue=queue.then(async()=>{
 try{
  const next=data.session+':'+data.rate;if(next!==key){detector=new NeuralSpeech.NeuralDetector(data.rate,async(input,state)=>{
   return runModel(input,state);
  });key=next;}
  const started=performance.now(),flags=[];for(const block of data.blocks)flags.push(...await detector.push(block.pcm,block.start));postMessage({id:data.id,flags,ms:performance.now()-started});
 }catch(error){postMessage({id:data.id,error:error.message})}
}).catch(error=>postMessage({id:data.id,error:error.message}));};
