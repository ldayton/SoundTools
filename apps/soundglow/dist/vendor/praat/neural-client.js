// SPDX-License-Identifier: GPL-3.0-or-later
(function(scope){
 class NeuralClient{
  constructor({WorkerType=scope.Worker,url='neural-worker.js',timeoutMs=80,now=()=>Date.now()}={}){this.WorkerType=WorkerType;this.url=url;this.timeoutMs=timeoutMs;this.now=now;this.retryAt=0;this.retryDelay=30000;this.worker=null;this.ready=false;this.failed=false;this.history=[];this.sequence=0;this.session=null;this.activeKey=null;this.pending=null;this.epoch=0}
  fail(reason='Speech confirmation unavailable',retry=true){this.retryAt=retry?this.now()+this.retryDelay:Infinity;this.retryDelay=Math.min(300000,this.retryDelay*2);this.error=reason;this.failed=true;this.ready=false;clearTimeout(this.loadingTimer);this.worker?.terminate();this.worker=null;this.pending?.finish(null)}
  start(){
   if(this.worker||this.failed&&this.now()<this.retryAt)return;this.failed=false;this.error=undefined;try{const worker=this.worker=new this.WorkerType(this.url);this.loadingTimer=setTimeout(()=>this.fail('Speech confirmation model loading timed out'),45000);this.worker.onmessage=({data})=>{if(this.worker!==worker)return;if(data.type==='ready'){this.ready=true;this.retryDelay=30000;this.retryAt=0;clearTimeout(this.loadingTimer)}else if(data.type==='unavailable'||data.error)this.fail(data.error);else if(data.id===this.pending?.id)this.pending.finish(data)};this.worker.onerror=event=>this.fail(event.message);}catch{this.fail()}
  }
  async push(data,enabled=true){
   if(this.pending)return {active:false,status:'busy'};
   if(this.session!==data.session||this.rate!==data.sampleRate||this.end!==undefined&&Math.abs(data.start-this.end)>1/data.sampleRate+1e-7){this.history=[];this.activeKey=null;this.session=data.session;this.rate=data.sampleRate;this.epoch++;}
   this.end=data.start+data.pcm.length/data.sampleRate;this.history.push({start:data.start,pcm:data.pcm.slice()});while(this.history.length>1&&this.history[0].start<this.end-1)this.history.shift();
   if(!enabled){this.activeKey=null;this.epoch++;return {active:false,status:'off'}}this.start();if(!this.ready)return {active:false,status:this.failed?'unavailable':'loading',error:this.error};
   const session=this.session+':'+this.epoch,blocks=(this.activeKey===session?this.history.slice(-1):this.history).map(b=>({start:b.start,pcm:b.pcm.slice()}));this.activeKey=session;
   if(this.pending)return {active:false,status:'busy'};
   const reply=await new Promise(resolve=>{const id=++this.sequence,timer=setTimeout(()=>this.fail('Speech confirmation exceeded inference deadline',false),this.timeoutMs);const finish=value=>{if(this.pending?.id!==id)return;clearTimeout(timer);this.pending=null;resolve(value)};this.pending={id,finish};try{this.worker.postMessage({id,session,rate:data.sampleRate,blocks},blocks.map(b=>b.pcm.buffer))}catch{this.fail()}});
   return reply?{active:true,status:'ready',decisions:reply.flags.filter(f=>f.time>=data.start-.2),ms:reply.ms}:{active:false,status:'unavailable',error:this.error};
  }
 }
 if(typeof module==='object'&&module.exports)module.exports={NeuralClient};else scope.NeuralClient=NeuralClient;
})(typeof self==='object'?self:globalThis);
