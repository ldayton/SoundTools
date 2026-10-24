import { createRequire } from 'node:module';
const viteCli = createRequire(import.meta.url).resolve('vite/package.json').replace(/package\.json$/, 'bin/vite.js');
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,[viteCli,'preview','--mode','pages','--outDir','dist-pages','--host','127.0.0.1','--port','4329','--strictPort'],{stdio:'pipe'});
let browser;
try{
 const url='http://127.0.0.1:4329/DoReGo/';for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await chromium.launch();const page=await browser.newPage({acceptDownloads:true}),remote:string[]=[];
 page.on('request',r=>{if(/sentry\.io/.test(r.url()))remote.push(r.url())});await page.goto(url);await page.locator('.diagnostics-panel').waitFor();
 assert.equal(await page.locator('.diagnostics-panel').evaluate((e:any)=>e.open),false);
 await page.locator('.diagnostics-panel > summary').click();assert.equal(await page.locator('.diagnostics-panel input').isDisabled(),!(await page.evaluate(()=>window.doregoDiagnostics!.getState().configured)));assert.equal(await page.locator('.diagnostics-panel input').isChecked(),false);
 await page.evaluate(()=>{window.doregoDiagnostics!.capture(new Error('PRIVATE exercise title'),'samples.test_failed');window.doregoDiagnostics!.metric('samples.prepare_ms',123)});
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download debug report',exact:true}).click();const file=await (await pending).path();assert(file);
 const report=JSON.parse(await readFile(file,'utf8'));assert.equal(report.app,'dorego');assert.equal(report.context.view,'practice');assert.equal(report.errors[0].code,'samples.test_failed');assert.equal(report.metrics['samples.prepare_ms'].max,123);assert(!JSON.stringify(report).includes('PRIVATE'));assert.match(report.release,/^[\da-f]{12}-[\da-f]{12}$/);assert.deepEqual(remote,[]);
 await page.getByRole('button',{name:'Clear saved reports',exact:true}).click();await page.getByText('Saved reports cleared.',{exact:true}).waitFor();await page.reload();await page.locator('.diagnostics-panel').waitFor();assert.deepEqual(((await page.evaluate(()=>window.doregoDiagnostics!.report())).previousReports as any[]).flatMap((r:any)=>r.errors),[]);
 await page.waitForFunction(()=>document.querySelector<HTMLButtonElement>('#play')?.disabled===false);await page.locator('#play').click();
 await page.waitForFunction(()=>((window.doregoDiagnostics!.snapshot().metrics as any)?.['render.interval_ms']?.count||0)>5);
 await page.locator('#play').click();const count=await page.evaluate(()=>((window.doregoDiagnostics!.snapshot().metrics as any)['render.interval_ms'].count));
 await page.waitForTimeout(300);await page.locator('#play').click();await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>((window.doregoDiagnostics!.snapshot().metrics as any)['render.interval_ms'].count)),count,'Resume must not count idle time or warmup frames');
 await page.waitForFunction(n=>((window.doregoDiagnostics!.snapshot().metrics as any)['render.interval_ms'].count)>n+5,count);
 console.log('DoReGo diagnostic UI/export/clear/privacy and pause/resume timing passed');
}finally{await browser?.close();server.kill()}
