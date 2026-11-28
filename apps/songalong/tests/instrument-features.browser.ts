import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {build} from 'esbuild';
import {launchBrowser,newPage,closeBrowser,captureFailure} from '../../../scripts/ci/browser-harness.cjs';
import type * as Fixture from '../../../packages/music-practice/test-fixtures/instrument-features';
declare global {interface Window {InstrumentFeatures:typeof Fixture}}
const browser=await launchBrowser();
try {
 const bundle=await build({entryPoints:[new URL('../../../packages/music-practice/test-fixtures/instrument-features.ts',import.meta.url).pathname],bundle:true,write:false,format:'iife',globalName:'InstrumentFeatures',platform:'browser'});
 // Four isolated, read-only render workers match this command's resource inventory.
 const discover=await newPage(browser);await discover.goto('about:blank');await discover.addScriptTag({content:bundle.outputFiles[0].text});
 const narrowKeyboard=await discover.evaluate(()=>window.InstrumentFeatures.renderNarrowKeyboard());
 assert(narrowKeyboard.marks>0);assert.deepEqual(narrowKeyboard.outside,[],'Named Voice/keyboard opening, signatures and hints fit the phone page');
 const scrollable=await discover.evaluate(()=>window.InstrumentFeatures.renderScrollablePassage());
 assert.equal(scrollable.overflow,'auto');assert.equal(scrollable.touchAction,'pan-x pan-y');
 assert(scrollable.max>0);assert.equal(scrollable.left,scrollable.max);assert(Math.abs(scrollable.handleOffset)<1,'Passage handles align after horizontal scrolling');
 const wrapped=await discover.evaluate(()=>window.InstrumentFeatures.renderWrappedAccompaniment());
 assert(wrapped.systems>1);assert.equal(wrapped.notes,20,'TAB continuation headers must not introduce extra instrument notes');
 assert.deepEqual(wrapped.misplacedLyrics,[],'Voice lyrics belong only to Voice across system boundaries');
 const ids=await discover.evaluate(()=>[...window.InstrumentFeatures.editions]);await discover.close();
 if(browser.browserType().name()==='chromium'){
  const touch=await newPage(browser,{viewport:{width:260,height:500},hasTouch:true});
  await touch.goto('about:blank');await touch.addScriptTag({content:bundle.outputFiles[0].text});
  const touchLayout=await touch.evaluate(()=>window.InstrumentFeatures.renderScrollablePassage(true));
  await touch.locator('[data-score-layout]').evaluate(paper=>{
   paper.setAttribute('data-native-scroll','pending');
   paper.addEventListener('scrollend',()=>paper.setAttribute('data-native-scroll','complete'),{once:true});
  });
  const cdp=await touch.context().newCDPSession(touch);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:190,y:75}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:140,y:75}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:40,y:75}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>touch.locator('[data-score-layout]').evaluate(n=>n.scrollLeft)).toBeGreaterThan(0);
  await expect(touch.locator('[data-passage-handle]:not([hidden])')).toHaveCount(0);
  await expect(touch.locator('[data-score-layout]')).toHaveAttribute('data-native-scroll','complete');
  // Native swipe distance/momentum is platform-dependent. Its movement and
  // selection independence are checked above; position the next selection
  // witness explicitly instead of requiring a short swipe to reach the end.
  await touch.locator('[data-score-layout]').evaluate(n=>{n.scrollLeft=n.scrollWidth;});
  await expect.poll(()=>touch.locator('[data-score-layout]').evaluate(n=>n.scrollLeft)).toBe(touchLayout.max);
  const point=await touch.locator('[data-score-layout]').evaluate(paper=>{
   const frame=paper.getBoundingClientRect();
   const note=[...paper.querySelectorAll<SVGGraphicsElement>('[data-passage-note]')].find(n=>{const b=n.getBoundingClientRect();return b.width&&b.left>=frame.left&&b.right<=frame.right;})!;
   const b=note.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};
  });
  await touch.touchscreen.tap(point.x,point.y);await touch.touchscreen.tap(point.x,point.y);
  await expect(touch.locator('[data-passage-handle]:not([hidden])')).toHaveCount(2);
  await touch.close();
 }
 let next=0;
 const results=await Promise.allSettled(Array.from({length:4},async()=>{
  const page=await newPage(browser,{viewport:{width:900,height:900}}),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
  while(next<ids.length){
   const id=ids[next++],arrangements=await page.evaluate(id=>window.InstrumentFeatures.combinations(id),id);
   for(const arrangement of arrangements){
    const result=await page.evaluate(({id,arrangement})=>window.InstrumentFeatures.renderInstrumentFeatures(id,arrangement),{id,arrangement});
    assert.deepEqual(result.renderMusic,result.music,`${id}/${arrangement}: displayed features preserve independent source notes and timing`);
    assert(result.marks.length>0,`${id}/${arrangement}: instrument fingerings are available`);
    assert.deepEqual(result.clipped,[],`${id}/${arrangement}: fingerings and tab stay in the score frame`);
    if(arrangement==='guitar-vocal'){
     assert(result.tabs.length>0&&!result.tabs.some(n=>n?.includes('?')),`${id}: accompaniment has complete tablature`);
     assert(result.marks.every(m=>m.staff==='1'),`${id}: no guitar fingering is attached to Voice`);
     assert.deepEqual(result.misplacedLyrics,[],`${id}: TAB must never duplicate Voice notes/lyrics into the guitar staff`);
     const narrow=await page.evaluate(id=>window.InstrumentFeatures.renderInstrumentFeatures(id,'guitar-vocal','both',false,320),id);
     assert.deepEqual(narrow.misplacedLyrics,[],`${id}: wrapped accompaniment must not borrow sung notes/lyrics`);
     const mixed=await page.evaluate(id=>window.InstrumentFeatures.renderInstrumentFeatures(id,'guitar-vocal','tab',false,320),id);
     assert.deepEqual(mixed.misplacedLyrics,[],`${id}: continuation systems preserve independent vocal underlay`);
     assert(mixed.rhythms>0,`${id}: accompaniment TAB includes its own rhythms`);
     assert(mixed.voiceTimingAnchors>0,`${id}: TAB-only guitar retains the visible singer's timing/highlight targets`);
     const tabOnly=await page.evaluate(id=>window.InstrumentFeatures.renderInstrumentFeatures(id,'guitar-vocal','tab',true),id);
     assert(tabOnly.marks.length>0&&tabOnly.marks.every(m=>m.staff==='1'));
     assert(tabOnly.tabs.length>0&&!tabOnly.tabs.some(n=>n?.includes('?')));
     assert(tabOnly.vertical.every(v=>v.status!=='fallback'),`${id}: projected TAB uses shared staff placement: ${JSON.stringify(tabOnly.vertical)}`);
     assert.deepEqual(tabOnly.renderMusic,result.renderMusic,`${id}: hiding Voice and notation preserves playback`);
    }else if(arrangement==='original')assert(result.marks.every(m=>!m.note?.startsWith('0:')),`${id}: keyboard fingering excludes Voice`);
   }
   console.log(`PASS ${id}: instrument features across ${arrangements.length} arrangements`);
  }
  assert.deepEqual(errors,[]);await page.close();
 }));
 for(const result of results)if(result.status==='rejected')throw result.reason;
}catch(error){await captureFailure(browser,error);throw error;}finally{await closeBrowser(browser);}
