import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {launchBrowser,newPage,waitForApp,closeBrowser,captureFailure} from '../../../scripts/ci/browser-harness.cjs';
import {preview} from '../../../packages/music-practice/browser-tests/server';
import {openPracticeOptions} from '../../../packages/music-practice/browser-tests/helpers';
const server=await preview('notewise',Number(process.env.TEST_PORT||4504));
const browser=await launchBrowser();
const formulas={hijaz:[0,1,4,5,7,8,10],kurd:[0,1,3,5,7,8,10],nahawand:[0,2,3,5,7,8,11],ajam:[0,2,4,5,7,9,11],nikriz:[0,2,3,6,7,9,10],hijazkar:[0,1,4,5,7,8,11]};
try{
 const errors:string[]=[];
 for(const [quality,intervals] of Object.entries(formulas)){
  // Independent contexts keep each musical scenario below WebKit's history quota.
  const page=await newPage(browser,{viewport:{width:1440,height:1000},serviceWorkers:'block'});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`${server.base}/guitar/scales?key=D&scale=${quality}&pattern=1&link=2&set=hila&from=5&labels=fingers`);
  await waitForApp(page,'.scale-diagram svg');await openPracticeOptions(page);
  await expect(page.locator('#scale-quality optgroup[label="Maqamat"] option')).toHaveText(['Hijaz','Kurd','Nahawand','Ajam','Nikriz','Hijazkar']);
  const hand=page.getByLabel('Hand position',{exact:true});
  await page.locator('#scale-quality').selectOption(quality);
  await expect(page.locator('#scale-pattern')).toHaveCount(0);
  await expect(page.locator('#scale-linked-pattern')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Show chord shape',exact:true})).toHaveCount(0);
  await expect(page.locator('.scale-relative-switch')).toHaveCount(0);
  await expect(page.locator('.scale-maqam-reference')).toContainText('Fretted reference');
  await expect(page.locator('.scale-source a')).toHaveAttribute('href',`https://www.maqamworld.com/en/maqam/${quality}.php`);
  for(const tonic of [0,2,6,9,11])for(const first of [1,7,14]){
   await page.locator('#scale-key').selectOption(String(tonic));await hand.selectOption(String(first));
   const expected=[];const tuning=[64,59,55,50,45,40];
   for(let string=6;string>=1;string--)for(let fret=first;fret<=first+4;fret++)if(intervals.includes((tuning[string-1]+fret-tonic+120)%12))expected.push(`${string}:${fret}`);
   await expect.poll(()=>page.locator('.scale-tone').evaluateAll(es=>es.map(e=>`${e.getAttribute('data-string')}:${e.getAttribute('data-fret')}`))).toEqual(expected);
   expect(await page.locator('.scale-tone text').evaluateAll(es=>es.every(e=>Number(e.textContent)>=1&&Number(e.textContent)<=4))).toBe(true);
  }
  await page.locator('#scale-key').selectOption('2');await hand.selectOption('5');
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/maqam-${quality}-mobile.png`,fullPage:true});
  await page.setViewportSize({width:1440,height:1000});await openPracticeOptions(page);
  await hand.selectOption('7');
 await page.locator('#scale-title').click();await page.keyboard.press('ArrowUp');
 await expect(hand).toHaveValue('8');
 await page.reload();await waitForApp(page,'.scale-diagram svg');await openPracticeOptions(page);
 await expect(page.locator('#scale-quality')).toHaveValue(quality);await expect(hand).toHaveValue('8');
 await expect(page.locator('#scale-dot-labels')).toHaveValue('fingers');
 await page.locator('#scale-quality').selectOption('major');
 await expect(page.locator('#scale-pattern')).toBeVisible();
 await expect(page.locator('.scale-maqam-reference')).toHaveCount(0);
  await page.close();
 }
 assert.deepEqual(errors,[]);
 console.log('PASS six maqamat: independently checked notes and fingers across keys/positions, sources, mobile, keyboard, reload, and CAGED isolation');
}catch(error){await captureFailure(browser,error);throw error;}
finally{await closeBrowser(browser);server.stop();}
