// SPDX-License-Identifier: GPL-3.0-or-later
// Soundglow-owned speech confirmation wraps the unchanged, source-matched Praat worker.
importScripts('worker.js','neural-client.js');
const nativeMessageHandler=self.onmessage,neuralClient=new NeuralClient();
self.onmessage=async event=>{
 const data=event.data;if(data.type!=='speech')return nativeMessageHandler(event);
 let reply;try{const started=performance.now(),native=await speech(data),neural=await neuralClient.push(data,data.neural!==false);reply={...native,neuralActive:neural.active,neuralStatus:neural.status,neuralError:neural.error,neuralDecisions:neural.decisions||[],ms:performance.now()-started};}catch(error){reply={id:data.id,error:error.message}}
 self.postMessage(reply);
};
