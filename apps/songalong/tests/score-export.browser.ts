import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {expect} from '@playwright/test';
import {PDFDocument,PDFRawStream,PDFName} from 'pdf-lib';
import {createHash} from 'node:crypto';
import {launchBrowser,newPage,waitForApp,captureFailure,closeBrowser,browserName} from '../../../scripts/ci/browser-harness.cjs';
import {preview} from '../../../packages/music-practice/browser-tests/server';
import {openPracticeOptions} from '../../../packages/music-practice/browser-tests/helpers';
import {practiceHymn} from '../../../packages/music-practice/test-fixtures/hymns';
const server=await preview('songalong',4627),browser=await launchBrowser();
const output=`work/browser-results/score-export-${browserName()}`;await mkdir(output,{recursive:true});
function imageHashes(pdf:PDFDocument) {
 return pdf.context.enumerateIndirectObjects().flatMap(([,object])=>object instanceof PDFRawStream&&object.dict.get(PDFName.of('Subtype'))?.toString()==='/Image'?[createHash('sha256').update(object.getContents()).digest('hex')]:[]).sort();
}
try {
 const page=await newPage(browser,{viewport:{width:1440,height:1000}});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.context().addInitScript(()=>{window.print=()=>{document.body.dataset.printed='true';};});
 await page.goto(`${server.base}/piano/hymns/${practiceHymn.slug}?mode=playback`);
 await waitForApp(page, ".hymn-controls");await expect(page.locator('.hymn-paper svg').first()).toBeVisible();await openPracticeOptions(page);
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
 let originalMobileImages:string[]=[];
 for(const size of ['Mobile','Desktop']) {
  await page.getByRole('button',{name:'Save PDF',exact:true}).click();
  const save=page.getByRole('button',{name:size,exact:true});await expect(save).toBeEnabled();
  await expect(save).not.toHaveAttribute('data-loading','true');
  await page.screenshot({path:`${output}/mobile-save-options.png`,animations:'disabled'});
  await save.click();await page.waitForFunction(()=>!!(window as any).sharedPdf);
  const file=await page.evaluate(()=>{const result=(window as any).sharedPdf;delete (window as any).sharedPdf;return result;});
  assert.match(file.name,new RegExp(`-${size.toLowerCase()}\\.pdf$`));const bytes=Uint8Array.from(file.bytes as number[]);
  assert.equal(new TextDecoder().decode(bytes.slice(0,5)),'%PDF-');const pdf=await PDFDocument.load(bytes);
  if(size==='Mobile')originalMobileImages=imageHashes(pdf);
  assert(pdf.context.enumerateIndirectObjects().some(([,object])=>object instanceof PDFRawStream&&object.dict.get(PDFName.of('SMask'))),'PDF blocks retain alpha masks so interlocking systems cannot erase earlier ink');
  assert(pdf.getPageCount()>0);const width=pdf.getPage(0).getWidth();assert(size==='Mobile'?width<300:Math.abs(width-595.28)<1);
  await writeFile(`${output}/${size.toLowerCase()}.pdf`,bytes);
 }
 // A changed score view invalidates prepared files, including their actual music images.
 await numbers.check();await expect(page.locator('.abcjs-bar-number').first()).toBeVisible();
 await page.getByRole('button',{name:'Save PDF',exact:true}).click();
 await expect(page.getByRole('button',{name:'Mobile',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Mobile',exact:true}).click();await page.waitForFunction(()=>!!(window as any).sharedPdf);
 const changed=await page.evaluate(()=>{const result=(window as any).sharedPdf;delete (window as any).sharedPdf;return result;});
 assert(originalMobileImages.length>0);assert.notDeepEqual(imageHashes(await PDFDocument.load(Uint8Array.from(changed.bytes as number[]))),originalMobileImages,'Changed bar-number view produces new score images, not a stale cached PDF');
 // Without native file sharing the same PDF is downloaded, not replaced with a link.
 await page.evaluate("Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false})");
 await page.getByRole('button',{name:'Save PDF',exact:true}).click();const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Mobile',exact:true}).click();assert.match((await download).suggestedFilename(),/-mobile\.pdf$/);
 const component=await build({entryPoints:[new URL('../../../packages/music-practice/src/score-export.ts',import.meta.url).pathname],bundle:true,write:false,format:'iife',globalName:'ScoreExportTest',platform:'browser'});
 await page.addScriptTag({content:component.outputFiles[0].text});
 const metadata=await page.evaluate<{header:string;blocks:number;layouts:{paper:string;width:number;lines:{text:string;x:number;y:number;width:number;height:number}[]}[]}>(`(async()=>{
  const source={title:'Export fixture',credits:['Words: Example Lyricist, 1779. last verse author unknown, before 1829.',"Music: 'Example Tune' de Example and Another Composer, 1831.",'Hebrew translation: Example Translator'],render(target){target.innerHTML='<div class="hymn-score-setup">Capo 5 · Sounding key: D major</div><div class="score-swing"><button class="score-swing-trigger">Swing</button></div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100"><path d="M20 20h160v2H20z"/></svg>';}};
  const result=await ScoreExportTest.prepareScoreExport(source,'desktop');
  const layouts=[];
  for(const paper of ['desktop','mobile']) {
   const prepared=await ScoreExportTest.prepareScoreExport(source,paper),block=prepared.blocks[0],svg=block.svg;
   svg.setAttribute('width',String(block.width));svg.setAttribute('height',String(block.height));document.body.append(svg);
   const lines=[...svg.querySelectorAll('text')].map(node=>{const box=node.getBBox();return {text:node.textContent,x:box.x,y:box.y,width:box.width,height:box.height};});
   layouts.push({paper,width:block.width,lines});svg.remove();
  }
  return {header:result.blocks[0].svg.textContent,blocks:result.blocks.length,layouts};
 })()`);
 assert(metadata.header.includes('de Example'),'Composer name casing is preserved');
 assert.equal(metadata.blocks,2);assert.match(metadata.header,/Capo 5 · Swing/);assert(!metadata.header.includes('Sounding key'),'Export retains essential capo/feel without duplicate setup text');
 for(const layout of metadata.layouts) {
  const title=layout.lines[0],words=layout.lines.find(line=>line.text.startsWith('Words:'))!,music=layout.lines.find(line=>line.text.startsWith('Music:'))!,translation=layout.lines.find(line=>line.text.startsWith('Hebrew translation:'))!;
  assert(Math.abs(title.x+title.width/2-layout.width/2)<1,'Title is visually centered');
  // Linux SVG bounds place italic overhang at -1.000034px rather than -1px.
  // Preserve the one-pixel ink boundary while ignoring sub-millipixel rounding.
  const epsilon=0.001;
  assert(layout.lines.every(line=>line.x>=-1-epsilon&&line.x+line.width<=layout.width+1+epsilon),'Header ink fits its page');
  assert(words.y>title.y+title.height+5,'Credits have visible separation from the title');
  assert(words.x<1&&translation.x<1,'Words and translator are left-aligned');
  assert(layout.paper==='mobile'?music.x<1:music.x>layout.width/2,'Music credits align to the appropriate desktop/mobile column');
  assert(!layout.lines.some(line=>/^1829\.$/.test(line.text)),'Supplemental credit does not strand its year');
 }
 assert.deepEqual(errors,[]);console.log('PASS: header hierarchy, credit columns and mobile wrapping');
 console.log('PASS: full-score desktop print, both PDF page sizes, native file-share payload, download fallback and essential musical metadata');
} catch(error){await captureFailure(browser,error);throw error;}
finally{await closeBrowser(browser);server.stop();}
