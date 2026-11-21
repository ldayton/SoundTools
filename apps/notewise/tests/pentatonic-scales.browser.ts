import { captureFailure, closeBrowser, launchBrowser, newPage, waitForApp } from '../../../scripts/ci/browser-harness.cjs';
import {chromium,firefox,webkit} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import {preview} from '../../../packages/music-practice/browser-tests/server';
const server=await preview('notewise',Number(process.env.TEST_PORT || 4498));
const engine=process.env.TEST_BROWSER || 'chromium';
assert.ok(engine in {chromium,firefox,webkit},'known test browser');
const fixed=await mkdtemp(join(tmpdir(),'notewise-pentatonic-'));
const browser=await launchBrowser({env:{...process.env,CFFIXED_USER_HOME:fixed}});
try {
 const page=await newPage(browser, {viewport:{width:1440,height:1000},serviceWorkers:'block'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [key,scale] of [['A','minor-pentatonic'],['C','major-pentatonic']]){
 await page.goto(`${server.base}/guitar/scales?key=${key}&scale=${scale}&pattern=1&link=2`);
 await page.locator('.scale-shift-candidate').first().waitFor();
 await page.locator('.scale-shift-candidate').first().click();
 await page.locator('.scale-link-transition').waitFor({state:'attached'});
 assert.equal(await page.locator('.scale-diagram svg').count(),1);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'Clear shift',exact:true}).click();
 await page.setViewportSize({width:1440,height:1000});
 }
 // The rendered pentatonic must remove notes without moving dots or fingers.
 await page.setViewportSize({width:390,height:844});
 const readTones=()=>page.locator('.scale-diagram .scale-tone').evaluateAll(elements=>elements.map(e=>({
  string:Number(e.getAttribute('data-string')),fret:Number(e.getAttribute('data-fret')),
  midi:Number(e.getAttribute('data-midi')),finger:e.querySelector('text')?.textContent,
 })));
 for(const [key,parent] of [['C','major'],['A','minor']])for(const shape of ['1','2','3','4','5']){
  const route=`${server.base}/guitar/scales?key=${key}&pattern=${shape}&position=0&labels=fingers`;
  await page.goto(`${route}&scale=${parent}`);
  await waitForApp(page,'.scale-diagram svg');
  await expect(page.locator('.scale-shift-candidate')).toHaveCount(0);
  const full=await readTones();
  await page.goto(`${route}&scale=${parent}-pentatonic`);
  await waitForApp(page,'.scale-diagram svg');
  await expect(page.locator('.scale-shift-candidate')).toHaveCount(0);
  await expect(page.locator('.scale-source a')).toHaveAttribute('href',`https://guitarscale.org/${parent==='major'?'c-major':'a-minor'}.html`);
  assert.deepEqual(await readTones(),full.filter(n=>[0,2,4,7,9].includes(n.midi%12)),`${key} ${parent} shape ${shape}`);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(parent==='major'&&shape==='2'){
   await page.locator('.scale-tone[data-string="4"][data-fret="14"]').scrollIntoViewIfNeeded();
   await page.screenshot({path:'/tmp/notewise-major-pentatonic-shape-2-mobile.png',fullPage:true});
   await page.setViewportSize({width:1440,height:1000});
   await page.screenshot({path:'/tmp/notewise-major-pentatonic-shape-2-desktop.png',fullPage:true});
   await page.setViewportSize({width:390,height:844});
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS pentatonic charts, bidirectional link, clear, exact full-scale subsets and fingers, mobile overflow, no runtime errors');
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {await closeBrowser(browser);server.stop();await rm(fixed,{recursive:true,force:true}).catch(()=>{});}
