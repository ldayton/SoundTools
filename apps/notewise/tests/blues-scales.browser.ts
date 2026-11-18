import { captureFailure, closeBrowser, launchBrowser, newPage } from '../../../scripts/ci/browser-harness.cjs';
import {chromium,firefox,webkit} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {preview} from '../../../packages/music-practice/browser-tests/server';
const server=await preview('notewise',Number(process.env.TEST_PORT || 4502));
const engine=process.env.TEST_BROWSER || 'chromium';
assert.ok(engine in {chromium,firefox,webkit},'known test browser');
const fixed=await mkdtemp(join(tmpdir(),'notewise-blues-'));
const browser=await launchBrowser({env:{...process.env,CFFIXED_USER_HOME:fixed}});
try {
 const page=await newPage(browser, {viewport:{width:1440,height:1000},serviceWorkers:'block'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [key,scale] of [['A','minor-blues'],['C','major-blues']]){
 await page.goto(`${server.base}/guitar/scales?key=${key}&scale=${scale}&pattern=1&link=2`);
 await page.locator('.scale-shift-candidate').first().waitFor();
 await page.locator('.scale-shift-candidate').first().click();
 await page.getByRole('region',{name:'Outward leg',exact:true}).waitFor();
 await page.getByRole('region',{name:'Return leg',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'Clear shift',exact:true}).click();
 await page.setViewportSize({width:1440,height:1000});
 }
 assert.deepEqual(errors,[]);console.log('PASS blues charts, both loop legs, clear, mobile overflow, no runtime errors');
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {await closeBrowser(browser);server.stop();await rm(fixed,{recursive:true,force:true}).catch(()=>{});}
