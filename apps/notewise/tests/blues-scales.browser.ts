import { captureFailure, closeBrowser, launchBrowser, newPage, waitForApp } from '../../../scripts/ci/browser-harness.cjs';
import {chromium,firefox,webkit} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
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
 await page.locator('.scale-link-transition').waitFor({state:'attached'});
 assert.equal(await page.locator('.scale-diagram svg').count(),1);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'Clear shift',exact:true}).click();
 await page.setViewportSize({width:1440,height:1000});
 }
 const readTones=()=>page.locator('.scale-diagram .scale-tone').evaluateAll(elements=>elements.map(e=>({
  string:Number(e.getAttribute('data-string')),fret:Number(e.getAttribute('data-fret')),
  midi:Number(e.getAttribute('data-midi')),finger:e.querySelector('text')?.textContent,
 })));
 for(const [key,family] of [['C','major'],['A','minor']])for(const shape of ['1','2','3','4','5']){
  const route=`${server.base}/guitar/scales?key=${key}&pattern=${shape}&position=0&labels=fingers`;
  await page.goto(`${route}&scale=${family}-pentatonic`);
  await waitForApp(page,'.scale-diagram svg');
  const pent=await readTones();
  await page.goto(`${route}&scale=${family}-blues`);
  await waitForApp(page,'.scale-diagram svg');
  const blues=await readTones();
  assert.deepEqual(blues.filter(n=>n.midi%12!==3),pent,`${family} shape ${shape}: only Eb added; shared fingers unchanged`);
  assert.ok(blues.some(n=>n.midi%12===3));
  const blue=page.locator('.scale-blue-note');
  assert.equal(await blue.count(),blues.filter(n=>n.midi%12===3).length);
  assert.ok(await blue.evaluateAll(es=>es.every(e=>Number(e.getAttribute('data-midi'))%12===3)));
  await expect(page.locator('.scale-link-legend')).toContainText(family==='major'?'Blue note (♭3)':'Blue note (♭5)');
  assert.equal(await blue.first().locator('circle').evaluate(e=>getComputedStyle(e).fill),'rgb(156, 54, 181)');
  await expect(page.locator('.scale-omitted-tone')).toHaveCount(0);
  await expect(page.locator('.scale-footnote')).toContainText('Same finger on adjacent frets: slide one fret.');
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(family==='major'&&shape==='2'){
   await page.locator('.scale-tone[data-string="3"][data-fret="9"]').scrollIntoViewIfNeeded();
   await page.screenshot({path:'/tmp/notewise-major-blues-shape-2-mobile.png',fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
  if(family==='major'&&shape==='2')await page.screenshot({path:'/tmp/notewise-major-blues-shape-2-desktop.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log('PASS blues charts, bidirectional link, clear, exact pentatonic supersets, consistent fingers and slide guidance, mobile overflow, no runtime errors');
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {await closeBrowser(browser);server.stop();await rm(fixed,{recursive:true,force:true}).catch(()=>{});}
