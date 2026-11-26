import {selectScoreDisplay,expectScoreDisplay} from "../../../packages/music-practice/browser-tests/helpers";
import { openHymnInstrumentChoices, selectHymnInstrument } from '../../../packages/music-practice/browser-tests/helpers';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { launchBrowser, newPage, captureFailure, closeBrowser } from '../../../scripts/ci/browser-harness.cjs';
import { preview } from '../../../packages/music-practice/browser-tests/server';
import { openPracticeOptions, dismissPracticeDrawer, practiceOption, openHymnControls } from '../../../packages/music-practice/browser-tests/helpers';
async function assertEngraving(page: import('playwright').Page) {
 const problems = await page.locator('.hymn-paper svg').evaluateAll(svgs => svgs.flatMap((svg, system) => {
  const root = (svg as SVGSVGElement).getScreenCTM()!.inverse();
  const view = (svg as SVGSVGElement).viewBox.baseVal;
  const result: string[] = [];
  for (const mark of svg.querySelectorAll<SVGGraphicsElement>('.beginner-fingering,.beginner-picking,.beginner-string,.abcjs-bar-number,.abcjs-part,.tab-rhythm-continuation')) {
   if (getComputedStyle(mark).visibility === 'hidden') continue;
   const ink = mark.getBBox(), transform = root.multiply(mark.getScreenCTM()!);
   const a = new DOMPoint(ink.x, ink.y).matrixTransform(transform);
   const b = new DOMPoint(ink.x + ink.width, ink.y + ink.height).matrixTransform(transform);
   if (a.x < view.x - 1 || b.x > view.x + view.width + 1 || a.y < view.y - 1 || b.y > view.y + view.height + 1)
    result.push(`System ${system+1}: clipped ${mark.textContent}`);
  }
  for (const finger of svg.querySelectorAll<SVGGraphicsElement>('.beginner-fingering')) {
   const a = finger.getBoundingClientRect();
   for (const head of svg.querySelectorAll<SVGGraphicsElement>('.abcjs-notehead,[data-name^="accidentals."]')) {
    if (getComputedStyle(head).visibility === 'hidden') continue;
    const b = head.getBoundingClientRect();
    if (Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)
     result.push(`System ${system+1}: finger ${finger.textContent} (${finger.dataset.pitch}, voice ${finger.dataset.voice}) touches ${head.parentElement?.getAttribute("class")}`);
   }
  }
  return result;
 }));
 assert.deepEqual(problems, []);
}
const server=await preview('songalong',4597);
const browser=await launchBrowser();
try {
 for(const width of [1440,768,390,320]) {
  const page=await newPage(browser,{viewport:{width,height:1000}});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.base+'/piano/hymns/the-1st-fingerstyle-blues?arrangement=guitar-fingerstyle&display=both&mode=playback');
  await page.locator('.hymn-paper .abcjs-note').first().waitFor();
  await expect(page.locator('[data-name=tabNumber]').first()).toBeVisible();
  const tabText=(await page.locator('[data-name=tabNumber]').allTextContents()).join('');
  assert(!tabText.includes('?'),tabText);
  assert(tabText.includes('53535'),tabText);
  await openHymnControls(page);
  await page.getByRole('checkbox',{name:'Show fingerings',exact:true}).check();
  await expect(page.locator('.beginner-fingering').first()).toBeVisible();
  await expect(page.locator('.beginner-picking').first()).toBeVisible();
  await expect(page.locator("g.abcjs-part")).toHaveCount(0);
  await assertEngraving(page);
  await openPracticeOptions(page);
  await expect(page.getByRole('table', { name: 'Playback staves' }).getByRole('columnheader')).toHaveText(['Staff', 'Show', 'Play']);
  await expect(page.locator('.hymn-instrument-picker, .hymn-toolbar-instruments [role="radio"][aria-checked="true"]')).toHaveAttribute('data-instrument', 'guitar');
  await openHymnInstrumentChoices(page);
  await expect(page.getByRole('radiogroup', { name: 'Instrument', exact: true }).getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Voice', exact: true })).toBeDisabled();
  assert.equal(await page.getByRole('group',{name:'Instruments and voice',exact:true}).locator('svg').count(),3);
  await selectHymnInstrument(page, 'guitar');
  await selectScoreDisplay(page,'notation');
  await expect(page.locator('[data-name=tabNumber]')).toHaveCount(0);
  await selectScoreDisplay(page,'tab');
  await expect(page.locator('[data-name=tabNumber]').first()).toBeVisible();
  assert(await page.locator('.tab-rhythm-stem').count());
  await expect(page.locator('.beginner-fingering')).toHaveCount(0);
  await expect(page.locator('.abcjs-bar.abcjs-v3')).toHaveCount(0);
  assert.equal(await page.locator('.fingerstyle-tab-clef').count(), await page.locator('.hymn-paper svg').count());
  await expect(page.locator('.abcjs-tempo')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Swing',exact:true})).toBeVisible();
  if(width===390){
   const swing=page.getByRole('button',{name:'Swing',exact:true}),help=page.getByRole('tooltip');
   await swing.focus();await expect(help).toBeVisible();
   await expect(help).toHaveText('Play each pair of eighth notes long–short rather than evenly. Keep the beat steady; playback uses the same swing feel.');
   await swing.press('Escape');await expect(help).toBeHidden();
   await swing.click();await expect(help).toBeVisible();
   const bounds=await help.boundingBox();assert(bounds && bounds.x>=0 && bounds.x+bounds.width<=width,'Swing explanation fits the phone');
   await swing.click();await expect(help).toBeHidden();
  }
  await assertEngraving(page);
  assert(await page.locator('.tab-rhythm-continuation').evaluateAll(nodes=>nodes.every(n=>{
   const model=(n as SVGElement).ownerSVGElement!.querySelector('.abcjs-tabNumber text')!;
   return getComputedStyle(n).fontSize===getComputedStyle(model).fontSize && getComputedStyle(n).fontFamily===getComputedStyle(model).fontFamily;
  })));
  assert(await page.locator('.tab-rhythm-half').count());
  assert(await page.locator('.tab-rhythm-rest').count());
  assert(await page.locator('.tab-rhythm-tie').count());
  await expect(page.locator('.tab-rhythm-meter')).toHaveCount(1);
  await dismissPracticeDrawer(page);
  await page.screenshot({path:`/tmp/songalong-fingerstyle-${width}-tab.png`,fullPage:true});
  assert(await page.locator('.hymn-paper svg').evaluateAll(es=>es.every(e=>(e as SVGSVGElement).viewBox.baseVal.height<400)), 'Each tab system fits its own music, including the whole-note ending');
  await expect(page.locator("g.abcjs-part")).toHaveCount(0);
  assert((await page.locator('[data-name=tabNumber]').allTextContents()).includes('2130'));
  if(width===1440) {
   await page.locator('.sequence-score').evaluate(e=>{e.scrollTop=e.scrollHeight;});
   await page.screenshot({path:'/tmp/songalong-beginner-ending.png',fullPage:true});
   await page.locator('.sequence-score').evaluate(e=>{e.scrollTop=0;});
  }
  // Display and instrument choices survive a reload independently.
  await page.goto(server.base+'/piano/hymns/the-1st-fingerstyle-blues?arrangement=guitar-fingerstyle&mode=playback');
  await page.locator('[data-name=tabNumber]').first().waitFor();
  await openPracticeOptions(page);
  await expectScoreDisplay(page,'tab');
  await selectHymnInstrument(page, 'piano');
  await expect(page.locator('[data-name=tabNumber]')).toHaveCount(0);
  await expect(page.locator('#hymn-score-display')).toHaveCount(0);
  await selectHymnInstrument(page, 'guitar');
  await expectScoreDisplay(page,'tab');
  await selectScoreDisplay(page,'both');
  await dismissPracticeDrawer(page);
  await page.screenshot({path:`/tmp/songalong-fingerstyle-${width}-both.png`,fullPage:true});
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
  await expect(page.locator('.hymn-count')).not.toHaveText('1 / 169');
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  if(width === 1440) {
   await page.goto(server.base+'/piano/hymns/the-1st-fingerstyle-blues?arrangement=guitar-fingerstyle&display=both&mode=playback&key=D&octave=0');
   await page.locator('[data-name=tabNumber]').first().waitFor();
   const shifted=(await page.locator('[data-name=tabNumber]').allTextContents()).join('');
   assert(!shifted.includes('?'));assert(shifted.includes('75757'),shifted);
   await page.goto(server.base+'/piano/hymns/the-1st-fingerstyle-blues?arrangement=guitar-fingerstyle&display=both&mode=playback&key=Bb&octave=0');
   await page.locator('[data-name=tabNumber]').first().waitFor();
   await expect(page).toHaveURL(/octave=1/);
   assert(!(await page.locator('[data-name=tabNumber]').allTextContents()).join('').includes('?'));
   await page.goto(server.base+'/piano/hymns/the-1st-fingerstyle-blues?arrangement=guitar-fingerstyle&display=both&mode=playback&key=original&octave=0');
   await page.locator('[data-name=tabNumber]').first().waitFor();
   await practiceOption(page,'#hymn-mode','wait');
   await openPracticeOptions(page);
   await expect(page.locator('.hymn-count')).toHaveText('1 / 169');
   // Resizing/reflowing tab must never change the musical practice timeline.
   for(const size of ['27','40']) {
    await practiceOption(page,'#hymn-size',size);
    await expect(page.locator('.hymn-count')).toHaveText('1 / 169');
    await openPracticeOptions(page);
    for(const display of ['notation','tab','both']) {
     await selectScoreDisplay(page,display);
     await expect(page.locator('.hymn-count')).toHaveText('1 / 169');
     await expect(page.locator('.sight-current')).not.toHaveCount(0);
    }
   }
   const engraved = await page.locator('.hymn-paper .abcjs-note').count();
   await expect(page.locator('#hymn-hands')).toHaveValue('both');
   await page.locator('#hymn-hands').selectOption('right');
   await expect(page.locator('.hymn-count')).toHaveText('1 / 119');
   assert.equal(await page.locator('.hymn-paper .abcjs-note').count(),engraved);
   await page.locator('#hymn-hands').selectOption('left');
   await expect(page.locator('.hymn-count')).toHaveText('1 / 97');
   await page.reload();await openPracticeOptions(page);
   await expect(page.locator('#hymn-hands')).toHaveValue('left');
   await expect(page.locator('.hymn-instrument-picker, .hymn-toolbar-instruments [role="radio"][aria-checked="true"]')).toHaveAttribute('data-instrument', 'guitar');
   await expectScoreDisplay(page,'both');
   await selectHymnInstrument(page, 'piano');
   await expect(page.locator('#hymn-hands')).toHaveValue('left');
   await expect(page.locator('.hymn-count')).toHaveText('1 / 99');
   await assertEngraving(page);
   await expect(page.locator('.abcjs-bar-number')).toHaveCount(0);
   await openPracticeOptions(page);
   await page.getByRole('checkbox',{name:'Bar numbers',exact:true}).check();
   const barNumbers=await page.locator('.abcjs-bar-number').allTextContents();
   assert(barNumbers.includes('13') && !barNumbers.includes('14'),barNumbers.join(','));
   await page.screenshot({path:'/tmp/songalong-fingerstyle-1440-piano.png',fullPage:true});
   await page.locator('.sequence-score').evaluate(e=>{e.scrollTop=e.scrollHeight;});
   await page.screenshot({path:'/tmp/songalong-beginner-piano-ending.png',fullPage:true});
  }
  await page.goto(server.base+'/piano/hymns/the-1st-fingerstyle-blues?arrangement=piano&display=notation&mode=playback');
  await page.locator('.beginner-fingering').first().waitFor();
  await assertEngraving(page);
  assert.deepEqual(errors,[]);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log(`PASS fingerstyle editions ${width}px`);
  await page.close();
 }
} catch(error) {await captureFailure(browser,error);throw error;}
finally {await closeBrowser(browser);server.stop();}
