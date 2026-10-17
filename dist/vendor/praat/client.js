/* A lazy, persistent worker with one in-flight request and explicit ownership. */
(function(scope){
 class PraatClient{
  constructor({workerURL='worker.js',WorkerType=scope.Worker,timeoutMs=30000}={}){this.url=workerURL;this.WorkerType=WorkerType;this.timeoutMs=timeoutMs;this.worker=null;this.pending=null;this.sequence=0}
  init(options){return this.request({type:'init'},options)}
  analyse(data,options){return this.request({...data,type:'analyse'},options)}
  lpc(data,options){return this.request({...data,type:'lpc'},options)}
  request(data,{signal,transfer=false}={}){
   const fail=(message,code)=>Object.assign(new Error(message),{code});
   if(signal?.aborted)return Promise.reject(fail('Analysis cancelled','CANCELLED'));
   if(this.pending)return Promise.reject(fail('Wait for the prior request','BUSY'));
   return new Promise((resolve,reject)=>{
    let worker;
    try{worker=this.worker||(this.worker=new this.WorkerType(this.url))}catch(e){reject(e);return}
    const id=++this.sequence,start=performance.now();
    const finish=(error,reply)=>{if(this.pending?.id!==id)return;clearTimeout(timer);signal?.removeEventListener('abort',cancel);this.pending=null;error?reject(error):resolve({...reply,roundtripMs:performance.now()-start})};
    const cancel=()=>{this.dispose(fail('Analysis cancelled','CANCELLED'))};
    const timer=setTimeout(()=>this.dispose(fail('Worker request timed out','TIMEOUT')),this.timeoutMs);
    this.pending={id,finish};signal?.addEventListener('abort',cancel,{once:true});
    worker.onmessage=({data:reply})=>{if(this.worker!==worker||reply?.id!==id)return;finish(reply.error?fail(reply.error,reply.code):null,reply)};
    worker.onerror=e=>{if(this.worker!==worker)return;this.dispose(fail(e.message||'Worker failed','WORKER_ERROR'))};
    try{worker.postMessage({...data,id},transfer&&data.pcm?[data.pcm.buffer]:[])}catch(e){finish(e)}
   });
  }
  dispose(reason=Object.assign(new Error('Worker disposed'),{code:'CANCELLED'})){
   this.worker?.terminate();this.worker=null;this.pending?.finish(reason);
  }
 }
 if(typeof module==='object'&&module.exports)module.exports={PraatClient};else scope.PraatClient=PraatClient;
})(typeof self==='object'?self:globalThis);
