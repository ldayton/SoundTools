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
 // Broad pitch/position combinations belong to Node tests. These two browser
 // witnesses prove conventional-box rendering, labels, source and hollow context.
 for(const [key,parent,shape] of [['C','major','2'],['A','minor','1']]){
  await page.goto(`${server.base}/guitar/scales?key=${key}&scale=${parent}-pentatonic&pattern=${shape}&position=0&labels=fingers`);
  await waitForApp(page,'.scale-diagram svg');
  await expect(page.locator('.scale-shift-candidate')).toHaveCount(0);
  const counts=await page.locator('.scale-tone').evaluateAll(es=>[6,5,4,3,2,1].map(s=>es.filter(e=>Number(e.getAttribute('data-string'))===s).length));
  assert.deepEqual(counts,[2,2,2,2,2,2]);
  const sample=page.locator(`.scale-tone[data-string="3"][data-fret="${parent==='major'?9:5}"]`);
  await expect(sample.locator('text')).toHaveText('1');
  const ghosts=page.locator('.scale-omitted-tone');
  assert.ok(await ghosts.count()>0);
  assert.ok(await ghosts.evaluateAll(es=>es.every(e=>getComputedStyle(e).pointerEvents==='none'&&!e.hasAttribute('tabindex')&&!e.classList.contains('scale-shift-candidate'))));
  assert.equal(await ghosts.first().locator('circle').evaluate(e=>getComputedStyle(e).fill),'rgb(255, 255, 255)');
  await expect(page.locator('.scale-link-legend')).toContainText(parent==='major'?'Omitted (4, 7)':'Omitted (2, ♭6)');
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:1000});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(parent==='major')await page.screenshot({path:`/tmp/notewise-conventional-pentatonic-${width}.png`,fullPage:true});
  }
 }
 await page.goto(`${server.base}/guitar/scales?key=C&scale=major-pentatonic&pattern=map&from=1&to=5`);
 await waitForApp(page,'.scale-diagram svg');
 assert.ok(await page.locator('.scale-omitted-tone').count()>0);
 await page.goto(`${server.base}/guitar/scales?key=C&scale=major&pattern=1`);
 await waitForApp(page,'.scale-diagram svg');
 await expect(page.locator('.scale-omitted-tone')).toHaveCount(0);
 assert.deepEqual(errors,[]);console.log('PASS pentatonic charts, bidirectional link, clear, conventional two-note boxes and fingers, mobile overflow, no runtime errors');
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {await closeBrowser(browser);server.stop();await rm(fixed,{recursive:true,force:true}).catch(()=>{});}
