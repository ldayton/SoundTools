const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {createDevServer}=require('../scripts/dev-server.cjs');
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
const close=server=>new Promise(resolve=>server.close(resolve));
function uncached(response){assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('etag'),null);assert.equal(response.headers.get('last-modified'),null);}
test('ordinary browser reload replaces legacy cached scripts, styles, workers and WASM at unchanged URLs and timestamps',async()=>{
 const {launchBrowser,newPage,captureFailure,closeBrowser}=require('../../../scripts/ci/browser-harness.cjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'soundglow-browser-freshness-'));await fs.mkdir(path.join(root,'dist'));
 const wasm=Buffer.from('0061736d010000000105016000017f030201000709010576616c756500000a0601040041010b','hex');
 const write=async version=>{
  const module=Buffer.from(wasm);module[module.length-2]=version;
  const files={
   'index.html':`<!doctype html><title>v${version}</title><link rel="stylesheet" href="style.css"><p id="script"></p><p id="worker"></p><p id="wasm"></p><script src="workspace.js"></script>`,
   'workspace.js':`document.getElementById('script').textContent='${version}';const worker=new Worker('worker.js');worker.onmessage=e=>document.getElementById('worker').textContent=e.data;WebAssembly.instantiateStreaming(fetch('engine.wasm')).then(({instance})=>document.getElementById('wasm').textContent=instance.exports.value());`,
   'worker.js':`postMessage('${version}');`,'style.css':`body{color:rgb(${version},0,0)}`,'engine.wasm':module};
  for(const [name,bytes] of Object.entries(files)){const file=path.join(root,'dist',name);await fs.writeFile(file,bytes);await fs.utimes(file,new Date(0),new Date(0));}
  await fs.mkdir(path.join(root,'tests/replay'),{recursive:true});
  await fs.writeFile(path.join(root,'tests/replay/harness.html'),files['index.html'].replace('<title>', '<head><base href="/dist/"></head><title>'));
 };
 await write(1);
 // Seed the HTTP cache as the previous generic static preview did. No routing
 // or cache-disabling browser flags: this must exercise a normal reload.
 let server=http.createServer(async(req,res)=>{const name=new URL(req.url,'http://localhost').pathname;try{const bytes=await fs.readFile(path.join(root,name));res.writeHead(200,{'Cache-Control':'public, max-age=31536000','Last-Modified':new Date(0).toUTCString(),'Content-Type':name.endsWith('.wasm')?'application/wasm':name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html'});res.end(bytes);}catch{res.writeHead(404).end();}});
 const origin=await listen(server),port=server.address().port;let browser;
 try{
  browser=await launchBrowser();const page=await newPage(browser);await page.goto(origin+'/dist/index.html');await page.waitForFunction(()=>['script','worker','wasm'].every(id=>document.getElementById(id).textContent==='1'));
  await close(server);server=createDevServer({root});await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  for(const version of [2,3]){
   await write(version);await page.reload();await page.waitForFunction(n=>['script','worker','wasm'].every(id=>document.getElementById(id).textContent===String(n)),version,{timeout:5000});
   assert.equal(await page.title(),'v'+version);assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).color),`rgb(${version}, 0, 0)`);
   const replay=await newPage(browser),errors=[];replay.on('pageerror',e=>errors.push(e.message));
   await replay.goto(origin+'/tests/replay/harness.html');
   await replay.waitForFunction(n=>['script','worker','wasm'].every(id=>document.getElementById(id).textContent===String(n)),version,{timeout:5000});
   assert.equal(await replay.locator('base').count(),1);
   assert.match(await replay.locator('base').getAttribute('href'),/^\/__dev\/[a-f0-9]{16}\/dist\/$/);
   assert.equal(await replay.locator('body').evaluate(el=>getComputedStyle(el).color),`rgb(${version}, 0, 0)`);
   assert.deepEqual(errors,[]);await replay.close();
  }
 }catch(error){await captureFailure(browser,error);throw error;}finally{await closeBrowser(browser);await close(server);await fs.rm(root,{recursive:true,force:true});}
});

