import { createRequire } from 'node:module';
const viteCli = createRequire(import.meta.url).resolve('vite/package.json').replace(/package\.json$/, 'bin/vite.js');
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,[viteCli,'preview','--mode','pages','--outDir','dist-pages','--host','127.0.0.1','--port','4329','--strictPort'],{stdio:'pipe'});
let browser;
try{
 const url='http://127.0.0.1:4329/DoReGo/';for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch();const page=await browser.newPage({acceptDownloads:true}),remote:string[]=[];
 page.on('request',r=>{if(/sentry\.io/.test(r.url()))remote.push(r.url())});await page.goto(url);await page.locator('.diagnostics-panel').waitFor();
 const sharing=page.getByRole('checkbox',{name:'Share diagnostic information',exact:true});
 assert.equal(await sharing.isChecked(),false);
 assert.equal(await page.locator('.diagnostics-panel button, .diagnostics-panel summary').count(),0);
 await page.evaluate(()=>window.doregoDiagnostics!.capture(Error('PRIVATE'),'before.opt_in'));
 assert.equal(await page.evaluate(()=>(window.doregoDiagnostics!.snapshot().errors as any[]).length),0);
 await sharing.check();
 await page.evaluate(()=>{window.doregoDiagnostics!.capture(new Error('PRIVATE exercise title'),'samples.test_failed');window.doregoDiagnostics!.metric('samples.prepare_ms',123)});
 const report=await page.evaluate(()=>window.doregoDiagnostics!.snapshot());
 assert.equal(report.app,'dorego');assert.equal((report.errors as any[])[0].code,'samples.test_failed');assert(!JSON.stringify(report).includes('PRIVATE'));assert.deepEqual(remote,[]);
 await page.reload();await sharing.waitFor();assert.equal(await sharing.isChecked(),true);
 await sharing.uncheck();await page.reload();await sharing.waitFor();assert.equal(await sharing.isChecked(),false);
 await sharing.check();
 await page.waitForFunction(()=>document.querySelector<HTMLButtonElement>('#play')?.disabled===false);await page.locator('#play').click();
 await page.waitForFunction(()=>((window.doregoDiagnostics!.snapshot().metrics as any)?.['render.interval_ms']?.count||0)>5);
 await page.locator('#play').click();const count=await page.evaluate(()=>((window.doregoDiagnostics!.snapshot().metrics as any)['render.interval_ms'].count));
 await page.waitForTimeout(300);await page.locator('#play').click();await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>((window.doregoDiagnostics!.snapshot().metrics as any)['render.interval_ms'].count)),count,'Resume must not count idle time or warmup frames');
 await page.waitForFunction(n=>((window.doregoDiagnostics!.snapshot().metrics as any)['render.interval_ms'].count)>n+5,count);
 console.log('DoReGo diagnostic opt-in/privacy and pause/resume timing passed');
}finally{await browser?.close();server.kill()}
