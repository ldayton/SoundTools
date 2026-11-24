import { captureFailure, closeBrowser, launchBrowser, newPage, waitForApp } from '../../../scripts/ci/browser-harness.cjs';
import { openPracticeOptions } from '../../../packages/music-practice/browser-tests/helpers';
import { chromium, firefox, webkit } from 'playwright';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const vite = createRequire(import.meta.url).resolve('vite/package.json').replace(/package\.json$/, 'bin/vite.js');
const server = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', '4362', '--strictPort'], { cwd: new URL('..', import.meta.url), stdio: 'ignore' });
for (let i = 0; i < 100; i++) {
  try { if ((await fetch('http://127.0.0.1:4362')).ok) break; } catch {}
  await new Promise(resolve => setTimeout(resolve, 100));
}
import assert from 'node:assert/strict';
const fixed = await mkdtemp(join(tmpdir(), 'notewise-linked-scales-'));
const engine = process.env.TEST_BROWSER || 'chromium';
let browser;
try {
 assert.ok(engine in {chromium, firefox, webkit}, 'known test browser');
 browser = await launchBrowser({env: {...process.env, CFFIXED_USER_HOME: fixed}});
 // Offline installation has separate coverage; this suite exercises scale navigation.
 const page=await newPage(browser, {serviceWorkers:'block'});
 const errors: string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4362/guitar/scales?key=C&scale=major&pattern=1&position=0&link=5');
 await page.locator('.scale-shared').first().waitFor();
 assert.equal(await page.locator('.scale-finger-alternate').count(), 9);
 const pivot = page.locator('.scale-tone[data-string="1"][data-fret="8"]').first();
 await pivot.click();
 assert.equal(await page.locator('.scale-shift-marker').count(), 1);
 assert.equal(await page.locator('.scale-shared').count(), 0);
 assert.equal(await page.locator('.scale-finger-alternate').count(), 0);
 const pivotMidi = Number(await pivot.getAttribute('data-midi'));
 for (const note of await page.locator('.scale-diagram .scale-route').all()) {
   const midi = Number(await note.getAttribute('data-midi'));
   assert.ok((await note.getAttribute('class'))!.includes(midi < pivotMidi ? 'scale-primary' : 'scale-secondary'));
 }
 await page.getByRole('button', { name: 'Clear shift', exact: true }).click();
 assert.equal(await page.locator('.scale-finger-alternate').count(), 9);
 const diagram = await page.locator('.scale-diagram').boundingBox();
 await page.locator('.scale-shift-candidate').first().click();
 assert.equal(await page.locator('.scale-shift-marker').count(),1);
 assert.equal((await page.locator('.scale-diagram').boundingBox())!.width,diagram!.width);
 await page.getByRole('button',{name:'Clear shift',exact:true}).click();
 await page.locator('#scale-title').click();
 await page.keyboard.press('Shift+?');
 const help = page.getByRole('dialog', { name: 'Scale keyboard shortcuts' });
 await help.waitFor();
 assert.ok((await help.innerText()).includes('12 frets'));
 const helpUrl=page.url();
 await page.keyboard.press('ArrowRight');assert.equal(page.url(),helpUrl,'help pauses navigation');
 await page.keyboard.press('Escape');await help.waitFor({state:'hidden'});
 await page.keyboard.press('?');await help.waitFor();
 await page.keyboard.press('?');await help.waitFor({state:'hidden'});
 await page.keyboard.press(']');
 await page.waitForFunction(() => new URL(location.href).searchParams.get('position') === '12');
 assert.equal(new URL(page.url()).searchParams.get('key'),'C');
 assert.equal(new URL(page.url()).searchParams.get('pattern'),'1');
 assert.equal(new URL(page.url()).searchParams.get('link'),'5');
 const sharedFrets = await page.locator('.scale-shared').evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('data-fret'))));
 assert.ok(sharedFrets.every(f => f >= 19));
 await page.keyboard.press(']');
 assert.equal(new URL(page.url()).searchParams.get('position'),'12','upper octave limit');
 await page.keyboard.press('[');
 await page.waitForFunction(() => new URL(location.href).searchParams.get('position') === '0');
 await page.keyboard.press('[');
 assert.equal(new URL(page.url()).searchParams.get('position'),'0','lower octave limit');
 await page.keyboard.press('ArrowDown');
 await page.waitForFunction(() => new URL(location.href).searchParams.get('pattern') === '2');
 assert.equal(new URL(page.url()).searchParams.get('key'),'C');
 assert.equal(new URL(page.url()).searchParams.get('link'),'1');
 await page.keyboard.press('ArrowUp');
 await page.waitForFunction(() => new URL(location.href).searchParams.get('pattern') === '1');
 assert.equal(new URL(page.url()).searchParams.get('position'),'0');
 assert.equal(new URL(page.url()).searchParams.get('link'),'5');
 await page.keyboard.press('ArrowRight');
 await page.getByRole('heading',{name:'D♭ major',exact:true}).waitFor();
 assert.equal(new URL(page.url()).searchParams.get('position'),'1');
 assert.ok(await page.locator('.scale-shared').count()>0);
 await page.keyboard.press('ArrowLeft');
 await page.getByRole('heading',{name:'C major',exact:true}).waitFor();
 await page.keyboard.press('Alt+ArrowRight');
 assert.equal(await page.locator('#scale-title').textContent(),'C major');
 await page.locator('#scale-key').focus();
 // Native select arrow navigation differs by engine; ] has no native action
 // and must not invoke the page's octave shortcut while a select has focus.
 await page.keyboard.press(']');
 assert.equal(new URL(page.url()).searchParams.get('position'),'0','focused dropdown must suppress page shortcuts');
 // Committing a control selection must release shortcut keys. Focusing a select
 // explicitly is essential: selectOption alone does not reproduce pointer focus.
 for(const [width,set,label,value,expectedKey] of [
   [1440,'standard','Scale type','major-pentatonic','Db'],
   [1440,'standard','Scale key','2','Eb'],
   [1440,'standard','Pattern','5','Db'],
   [1440,'hila','Shape','2','Db'],
   [1440,'hila','Shape set','standard','Db'],
   [393,'standard','Scale type','minor','C#'],
   [393,'hila','Shape','2','Db'],
 ] as const){
   const controlsPage=await newPage(browser,{viewport:{width,height:1000},hasTouch:width===393});
   controlsPage.on('pageerror',e=>errors.push(e.message));
   await controlsPage.goto(`http://127.0.0.1:4362/guitar/scales?key=C&scale=major&set=${set}&pattern=1&shape=1`);
   await waitForApp(controlsPage,'.scale-diagram svg');await openPracticeOptions(controlsPage);
   const control=controlsPage.getByLabel(label,{exact:true});
   await control.focus();await control.selectOption(value);
   assert.equal(await controlsPage.getByRole('group',{name:'Scale controls',exact:true}).evaluate(e=>document.activeElement===e),true,'committed selection releases the dropdown without leaving the options panel');
   await controlsPage.keyboard.press('ArrowRight');
   await controlsPage.waitForFunction(key=>new URL(location.href).searchParams.get('key')===key,expectedKey);
   assert.ok((await controlsPage.locator('#scale-title').innerText()).startsWith(expectedKey==='C#'?'C♯':expectedKey==='Db'?'D♭':'E♭'));
   await controlsPage.close();
 }
 await page.locator('#scale-title').click();
 await page.goto('http://127.0.0.1:4362/guitar/scales?key=F%23&scale=major&pattern=1&position=-6');
 await page.getByRole('heading',{name:'F♯ major',exact:true}).waitFor();
 await page.keyboard.press('ArrowLeft');
 assert.equal(await page.locator('#scale-title').textContent(),'F♯ major','respect first-fret boundary');
 // G major leaves room to traverse all five forms without hitting a fret limit.
 // Assert visible labels and stable IDs independently of the production order.
 await page.goto('http://127.0.0.1:4362/guitar/scales?key=G&scale=major&set=standard&pattern=3&link=none');
 await waitForApp(page,'.scale-diagram svg');
 const caged=[['3','C'],['4','A'],['5','G'],['1','E'],['2','D']] as const;
 assert.deepEqual(await page.locator('#scale-pattern option').allTextContents(),['Fret range',...caged.map(([,name])=>`${name} shape`)]);
 await page.locator('#scale-title').click();
 for(const [key,order] of [['ArrowDown',caged.slice(1)],['ArrowUp',caged.slice(0,-1).reverse()]] as const){
   for(const [id,name] of order){
     await page.keyboard.press(key);
     await page.waitForFunction(id=>new URL(location.href).searchParams.get('pattern')===id,id);
     assert.equal(await page.locator('#scale-pattern').inputValue(),id);
     assert.ok((await page.locator('.scale-pattern-caption').innerText()).startsWith(`${name} shape ·`));
   }
 }
 // CAGED's selector is C, A, G, E, D; raw IDs are intentionally not that order.
 for(const [pattern,position,link,key] of [
   ['3',0,'none','ArrowUp'], ['2',0,'none','ArrowDown'],
   ['1',0,'2','ArrowDown'], ['4',12,'3','ArrowUp'],
 ] as const){
   await page.goto(`http://127.0.0.1:4362/guitar/scales?key=C&scale=major&set=standard&pattern=${pattern}&position=${position}&link=${link}&labels=none`);
   await waitForApp(page,'.scale-diagram svg');
   const url=page.url(), diagram=await page.locator('.scale-diagram svg').evaluate(svg=>svg.outerHTML);
   await page.locator('#scale-title').click();await page.keyboard.press(key);
   assert.equal(page.url(),url,'CAGED and linked endpoints do not wrap');
   assert.equal(await page.locator('.scale-diagram svg').evaluate(svg=>svg.outerHTML),diagram,'Blocked navigation leaves the diagram unchanged');
 }
 await page.getByRole('link',{name:'Scales & degrees',exact:true}).click();
 await page.locator('.scale-card').waitFor({state:'hidden'});
 const url=page.url();await page.keyboard.press('ArrowRight');assert.equal(page.url(),url,'inactive scale controller ignores keys');
 assert.deepEqual(errors,[]);
 console.log('PASS: linked scales, all keyboard shortcuts, help modal, input focus, fret boundaries, and activity exit');
} catch (error) {
  await captureFailure(browser, error);
  throw error;
}finally{await closeBrowser(browser); server.kill(); await rm(fixed, {recursive:true, force:true}).catch((error:NodeJS.ErrnoException) => { if (error.code !== 'EACCES' && error.code !== 'EPERM') throw error; });}
