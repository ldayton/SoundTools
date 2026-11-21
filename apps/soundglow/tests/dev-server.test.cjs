const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {createDevServer}=require('../scripts/dev-server.cjs');
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));
function uncached(response){assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('etag'),null);assert.equal(response.headers.get('last-modified'),null);}
test('every local asset and error is uncached, conditional requests receive current bytes, and WASM keeps its MIME type',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'soundglow-dev-'));await fs.mkdir(path.join(root,'dist'));
 const files={'index.html':'<title>fresh</title>','workspace.js':'first','style.css':'body{}','worker.js':'postMessage(1)','engine.wasm':Buffer.from([0,97,115,109,1,0,0,0])};
 for(const [name,bytes] of Object.entries(files))await fs.writeFile(path.join(root,'dist',name),bytes);
 const server=createDevServer({root}),origin=await listen(server);
 try{
  for(const name of Object.keys(files)){const r=await fetch(origin+'/dist/'+name);assert.equal(r.status,200);uncached(r);if(name.endsWith('.wasm'))assert.equal(r.headers.get('content-type'),'application/wasm');await r.arrayBuffer();}
  await fs.writeFile(path.join(root,'dist/workspace.js'),'newer');await fs.utimes(path.join(root,'dist/workspace.js'),new Date(0),new Date(0));
  const r=await fetch(origin+'/dist/workspace.js',{headers:{'If-Modified-Since':'Thu, 01 Jan 2099 00:00:00 GMT','If-None-Match':'"old"'}});assert.equal(r.status,200);uncached(r);assert.equal(await r.text(),'newer');
  const head=await fetch(origin+'/dist/workspace.js',{method:'HEAD'});uncached(head);assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),'5');
  for(const [url,status] of [['/missing.js',404],['/dist/.env',403],['/dist/%ZZ',400]]){const r=await fetch(origin+url);assert.equal(r.status,status);uncached(r);}
  const home=await fetch(origin,{redirect:'manual'});assert.equal(home.headers.get('location'),'/dist/index.html');uncached(home);
 }finally{await close(server);await fs.rm(root,{recursive:true,force:true});}
});
test('UI import changes rebuild automatically; failed builds return 503 until repaired', async () => {
 const {watchUi}=require('../scripts/dev-ui.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'soundglow-ui-watch-'));
 await fs.mkdir(path.join(root,'dist/ui'),{recursive:true});
 await fs.writeFile(path.join(root,'dist/index.html'),'<head></head><script src="ui/app.js"></script>');
 const shared=path.join(root,'shared.js'),entry=path.join(root,'entry.js'),config=path.join(root,'vite.config.mjs');
 await fs.writeFile(shared,'export const value="first-value";');
 await fs.writeFile(entry,'import {value} from "./shared.js";globalThis.result=value;');
 await fs.writeFile(config,`export default {root:${JSON.stringify(root)},logLevel:'silent',plugins:[{name:'slow-fixture-build',async buildStart(){await new Promise(resolve=>setTimeout(resolve,60))}}],build:{outDir:'dist/ui',lib:{entry:${JSON.stringify(entry)},formats:['iife'],name:'UiWatch',fileName:()=> 'app.js'}}};`);
 const messages=[];const ui=await watchUi({configFile:config,log:message=>messages.push(message)});
 const server=createDevServer({root,beforeRequest:ui.ready}),origin=await listen(server);
 async function until(check) {const end=Date.now()+10000;while(Date.now()<end){if(await check())return;await new Promise(resolve=>setTimeout(resolve,50));}assert.fail('UI watcher did not reach the expected state');}
 try {
  const [html,script]=await Promise.all([fetch(origin+'/dist/index.html'),fetch(origin+'/dist/ui/app.js')]);
  assert.equal(html.status,200);assert.equal(script.status,200);assert.match(await script.text(),/first-value/);
  await fs.writeFile(shared,'export const value="second-value";');
  await until(async()=>/second-value/.test(await (await fetch(origin+'/dist/ui/app.js')).text()));
  await fs.writeFile(shared,'export const value=;');
  await until(async()=> (await fetch(origin+'/dist/index.html')).status===503);
  assert.equal((await fetch(origin+'/dist/ui/app.js')).status,503);
  await fs.writeFile(shared,'export const value="recovered-value";');
  await until(async()=>/recovered-value/.test(await (await fetch(origin+'/dist/ui/app.js')).text()));
  assert.equal((await fetch(origin+'/dist/index.html')).status,200);
  assert(messages.some(message=>message.includes('build failed')));
 } finally {await close(server);await ui.close();await fs.rm(root,{recursive:true,force:true});}
});

test('the development command works from the repository root and closes its UI watcher', {timeout:30000}, async () => {
 const {spawn}=require('node:child_process');
 const net=require('node:net');
 const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
 const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 const root=path.resolve(__dirname,'../../..'),command=path.resolve(__dirname,'../scripts/dev-server.cjs');
 const child=spawn(process.execPath,[command,'--port',String(port)],{cwd:root,stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',chunk=>{logs+=chunk});child.stderr.on('data',chunk=>{logs+=chunk});
 const exited=new Promise(resolve=>child.once('exit',resolve));
 try {
  const deadline=Date.now()+20000;let response;
  while(Date.now()<deadline){
   assert.equal(child.exitCode,null,logs);
   try {const candidate=await fetch(`http://127.0.0.1:${port}/dist/index.html`,{signal:AbortSignal.timeout(1000)});if(candidate.ok){response=candidate;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert(response,'Development server did not become ready: '+logs);
  const html=await response.text();assert.match(html,/ui\/soundglow-ui\.js/);
  const base=html.match(/<base href="([^"]+)"/)[1];
  const script=await fetch(new URL('ui/soundglow-ui.js',`http://127.0.0.1:${port}${base}`));
  assert.equal(script.status,200);assert((await script.text()).length>1000);
 } finally {child.kill('SIGTERM');await exited;}
});

test('account POST reaches the shared handler and confirmation loads fresh app assets from the correct base', async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'soundglow-login-'));await fs.mkdir(path.join(root,'dist'));
 await fs.writeFile(path.join(root,'dist/index.html'),'<head></head><script src="ui/soundglow-ui.js"></script>');
 const server=createDevServer({root,login:async(req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({method:req.method}));}}),origin=await listen(server);
 try{
  const posted=await fetch(origin+'/api/account/login',{method:'POST',body:'{}'});assert.deepEqual(await posted.json(),{method:'POST'});uncached(posted);
  const callback=await fetch(origin+'/auth/confirm');assert.equal(callback.status,200);assert.equal(callback.headers.get('referrer-policy'),'no-referrer');uncached(callback);assert.match(await callback.text(),/<base href="\/__dev\/[a-f0-9]{16}\/dist\/">/);
 }finally{await close(server);await fs.rm(root,{recursive:true,force:true});}
});
