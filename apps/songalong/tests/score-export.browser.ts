import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {expect} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';
import {launchBrowser,newPage,waitForApp,captureFailure,closeBrowser,browserName} from '../../../scripts/ci/browser-harness.cjs';
import {preview} from '../../../packages/music-practice/browser-tests/server';
import {openPracticeOptions} from '../../../packages/music-practice/browser-tests/helpers';
import {practiceHymn} from '../../../packages/music-practice/test-fixtures/hymns';
const server=await preview('songalong',4627),browser=await launchBrowser();
const output=`work/browser-results/score-export-${browserName()}`;await mkdir(output,{recursive:true});
try {
 const page=await newPage(browser,{viewport:{width:1440,height:1000}});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.context().addInitScript(()=>{window.print=()=>{document.body.dataset.printed='true';};});
 await page.goto(`${server.base}/piano/hymns/${practiceHymn.slug}?mode=playback`);
 await waitForApp(page,'.hymn-toolbar-instruments');await expect(page.locator('.hymn-paper svg').first()).toBeVisible();await openPracticeOptions(page);
 const popupPromise=page.waitForEvent('popup');await page.getByRole('button',{name:'Print',exact:true}).click();const popup=await popupPromise;
 await popup.waitForFunction(()=>document.body.dataset.printed==='true');
 await expect(popup.locator('section svg').first()).toBeVisible();
 assert.equal(await popup.title(),practiceHymn.title);assert.equal(await popup.locator('button,input,nav').count(),0);
 assert(await popup.locator('section svg').count()>1,'Printed sheet has title and score systems');
 const headers=await popup.locator('section svg').evaluateAll(svgs=>svgs.map(svg=>svg.querySelectorAll('.abcjs-clef,.abcjs-key-signature').length));
 assert(headers[1]>0&&headers.slice(2).every(count=>count===0),'Printed score repeats no unchanged clefs or key signatures');
 await popup.screenshot({path:`${output}/desktop-print.png`,fullPage:true});await popup.close();
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.practice-options')?.dataset.layout==='mobile');
 await openPracticeOptions(page);
  const numbers=page.getByRole("checkbox",{name:"Bar numbers",exact:true});
  await expect(numbers).not.toBeChecked();
  await expect(page.locator(".abcjs-bar-number,.abcjs-part,.abcjs-tempo")).toHaveCount(0);
  await numbers.check();
  await expect(page.locator(".abcjs-bar-number").first()).toBeVisible();
  await page.reload();
  await waitForApp(page,".hymn-pause");
  await openPracticeOptions(page);
  await expect(numbers).toBeChecked();
  await expect(page.locator(".abcjs-bar-number").first()).toBeVisible();
  await numbers.uncheck();
  await expect(page.locator(".abcjs-bar-number")).toHaveCount(0);
 await page.evaluate(`Object.defineProperty(navigator,'canShare',{configurable:true,value:({files})=>files?.[0]?.type==='application/pdf'});
 Object.defineProperty(navigator,'share',{configurable:true,value:async ({files})=>{window.sharedPdf={name:files[0].name,bytes:Array.from(new Uint8Array(await files[0].arrayBuffer()))};}});`);
 for(const size of ['Mobile','Desktop']) {
  await page.getByRole('button',{name:'Save PDF',exact:true}).click();
  const save=page.getByRole('button',{name:size,exact:true});await expect(save).toBeEnabled();
  await expect(save).not.toHaveAttribute('data-loading','true');
  await page.screenshot({path:`${output}/mobile-save-options.png`,animations:'disabled'});
  await save.click();await page.waitForFunction(()=>!!(window as any).sharedPdf);
  const file=await page.evaluate(()=>{const result=(window as any).sharedPdf;delete (window as any).sharedPdf;return result;});
  assert.match(file.name,new RegExp(`-${size.toLowerCase()}\\.pdf$`));const bytes=Uint8Array.from(file.bytes as number[]);
  assert.equal(new TextDecoder().decode(bytes.slice(0,5)),'%PDF-');const pdf=await PDFDocument.load(bytes);
  assert(pdf.getPageCount()>0);const width=pdf.getPage(0).getWidth();assert(size==='Mobile'?width<300:Math.abs(width-595.28)<1);
  await writeFile(`${output}/${size.toLowerCase()}.pdf`,bytes);
 }
 // Without native file sharing the same PDF is downloaded, not replaced with a link.
 await page.evaluate("Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false})");
 await page.getByRole('button',{name:'Save PDF',exact:true}).click();const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Mobile',exact:true}).click();assert.match((await download).suggestedFilename(),/-mobile\.pdf$/);
 assert.deepEqual(errors,[]);console.log('PASS: full-score desktop print, both PDF page sizes, native file-share payload and download fallback');
} catch(error){await captureFailure(browser,error);throw error;}
finally{await closeBrowser(browser);server.stop();}
