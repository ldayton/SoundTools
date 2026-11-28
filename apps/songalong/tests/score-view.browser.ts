import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {launchBrowser,newPage,waitForApp,captureFailure,closeBrowser} from '../../../scripts/ci/browser-harness.cjs';
import {preview} from '../../../packages/music-practice/browser-tests/server';
import {openPracticeOptions,dismissPracticeDrawer,expectScoreDisplay,openHymnControls} from '../../../packages/music-practice/browser-tests/helpers';
import {guitarEditionHymn,selectOctaveCapableGuitarHymn} from '../../../packages/music-practice/test-fixtures/hymns';
const server=await preview('songalong',4628),browser=await launchBrowser();
try {
 const page=await newPage(browser,{viewport:{width:1440,height:1000}});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  (window as any).chordPreviewAttacks=[];
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args:Parameters<typeof start>){
   if(this.context instanceof AudioContext&&!this.loop)(window as any).chordPreviewAttacks.push(args[0]||0);
   return start.apply(this,args);
  };
 });
  await page.goto(`${server.base}/piano/hymns/${guitarEditionHymn!.slug}?arrangement=guitar-edition&display=both&mode=playback`);
  await waitForApp(page, ".hymn-controls");
  await page.setViewportSize({width:1440,height:1000});
  const staffSize = page.getByRole("spinbutton",{name:"Staff size in pixels",exact:true});
  await staffSize.fill("40");await staffSize.press("Enter");
  await expect(staffSize).toHaveValue("40 px");
  const systemCount = () => page.locator(".hymn-paper svg").count();
  await expect.poll(() => page.locator('.hymn-paper svg').first().evaluate(svg=>svg.getBoundingClientRect().width)).toBeGreaterThan(600);
  const largeSystems = await systemCount();
  await staffSize.fill("27");await staffSize.press("Enter");
  await expect.poll(systemCount).toBeLessThan(largeSystems);
  await expect(page.locator('[data-name=tabNumber]').first()).toBeVisible();
  await openPracticeOptions(page);
  const showTab=page.getByRole("checkbox",{name:"Show Tablature",exact:true});
  const showTreble=page.getByRole("checkbox",{name:"Show Treble",exact:true});
  const showChords=page.getByRole("checkbox",{name:"Show Chords",exact:true});
  await expect(page.getByRole("checkbox",{name:"Play Tablature",exact:true})).toBeDisabled();
  await expect(page.getByRole("checkbox",{name:"Play Chords",exact:true})).toBeDisabled();
  await expect(page.locator('#hymn-score-display')).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Display',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'View options',exact:true}).getByRole('checkbox',{name:'Bar numbers',exact:true})).toBeVisible();
  await showTreble.uncheck();await showTab.uncheck();
  await expect(page.locator('.chords-only-score').first()).toBeVisible();
  await expect(showChords).toBeChecked();
  await expect(page.getByRole('checkbox',{name:'Play Treble',exact:true})).toBeChecked();
  await showTreble.check();await showTab.check();
  await showTab.uncheck();
  await expect(page.locator("[data-name=tabNumber]")).toHaveCount(0);
  await showTab.check();await showTreble.uncheck();
  await expectScoreDisplay(page,"tab");
  const frets=await page.locator("[data-name=tabNumber]").allTextContents();
  await showChords.uncheck();
  await expect(page.locator(".abcjs-chord")).toHaveCount(0);
  assert.deepEqual(await page.locator("[data-name=tabNumber]").allTextContents(),frets);
  await page.reload();await waitForApp(page, ".hymn-controls");await openPracticeOptions(page);
  await expect(showChords).not.toBeChecked();await expect(showTreble).not.toBeChecked();await expect(showTab).toBeChecked();
  await expect(page.getByRole("checkbox",{name:"Play Treble",exact:true})).toBeChecked();
  await showTab.uncheck();await expect(page.locator(".hymn-paper svg:visible")).toHaveCount(0);
  await showTreble.check();await expect(page.locator(".hymn-paper svg:visible").first()).toBeVisible();
  await showChords.check();await dismissPracticeDrawer(page);
  await page.getByRole("button",{name:/^Show .* chord diagram$/}).first().click();
  const chordDialog=page.getByRole("dialog");
  const chordNotes=chordDialog.locator('[data-string]:not([data-fret="not-played"])');
  await chordDialog.waitFor({state:'visible'});
  await chordNotes.first().waitFor({state:'visible'});
  const toneCount=await chordNotes.count();
  assert(toneCount>0,'The preview must exercise a rendered, nonempty chord');
  await page.evaluate(()=>{(window as any).chordPreviewAttacks=[];});
  await chordDialog.getByRole("button",{name:/^Play .* chord and breakdown$/}).click();
  await page.waitForFunction(count=>(window as any).chordPreviewAttacks.length===count*2,toneCount);
  const attacks=await page.evaluate(()=>(window as any).chordPreviewAttacks as number[]);
  assert(attacks.slice(0,toneCount).every(time=>time===attacks[0]));
  assert.deepEqual(attacks.slice(toneCount).map(time=>Math.round((time-attacks[0])*100)/100),Array.from({length:toneCount},(_,index)=>1+index*.5));
  await chordDialog.getByRole("button",{name:"Close chord diagram",exact:true}).click();


 for(const width of [1440,393]){
  const combined=await newPage(browser,{viewport:{width,height:1000}});
  combined.on('pageerror',e=>errors.push(e.message));
  await combined.goto(`${server.base}/piano/hymns/${guitarEditionHymn!.slug}?arrangement=guitar-vocal&display=both&mode=playback&stanzas=1`);
  await waitForApp(combined,'.hymn-controls');
  await expect(combined.locator('.abcjs-tabNumber').first()).toBeVisible();
  await openHymnControls(combined);
  const fingerings=combined.getByRole('checkbox',{name:'Show fingerings',exact:true});
  await fingerings.check();
  await expect(combined.locator('.beginner-fingering[data-staff="1"]').first()).toBeVisible();
  assert(await combined.locator('.beginner-fingering').evaluateAll(nodes=>nodes.every(n=>(n as HTMLElement).dataset.staff==='1')),'Fretting hints never label the singer');
  await openPracticeOptions(combined);
  const guitar=combined.getByRole('checkbox',{name:'Show Guitar',exact:true}),voice=combined.getByRole('checkbox',{name:'Show Voice',exact:true}),tab=combined.getByRole('checkbox',{name:'Show Tablature',exact:true});
  await guitar.uncheck();await voice.uncheck();
  await expect(fingerings).toBeEnabled();await expect(tab).toBeChecked();
  await dismissPracticeDrawer(combined);
  await expect(combined.locator('.abcjs-tabNumber').first()).toBeVisible();
  await expect(combined.locator('.beginner-fingering[data-staff="1"]').first()).toBeVisible();
  await openPracticeOptions(combined);await guitar.check();await expect(voice).not.toBeChecked();
  await combined.reload();await waitForApp(combined,'.hymn-controls');await openPracticeOptions(combined);
  await expect(voice).not.toBeChecked();await expect(guitar).toBeChecked();await expect(tab).toBeChecked();
  await voice.check();await guitar.uncheck();await tab.uncheck();
  await expect(fingerings).toBeDisabled();await expect(fingerings).toHaveAttribute('title',/notation or tablature/);
  await dismissPracticeDrawer(combined);
  await combined.getByRole('button',{name:/^Show .* chord diagram$/}).first().click();
  await expect(combined.getByRole('dialog',{name:/chord/})).toBeVisible();
  await combined.getByRole('button',{name:'Close chord diagram',exact:true}).click();
  await expect(combined.getByRole('dialog',{name:/chord/})).toBeHidden();
  await openPracticeOptions(combined);await tab.check();await dismissPracticeDrawer(combined);
  assert(await combined.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mixed voice/tab fits the page');
  const outside=await combined.locator('.hymn-paper').evaluate(paper=>{
   const frame=paper.getBoundingClientRect();
   return [...paper.querySelectorAll<SVGGraphicsElement>('.abcjs-tab-number,.beginner-fingering,.abcjs-lyric')].filter(n=>getComputedStyle(n).visibility!=='hidden').flatMap(n=>{
    const b=n.getBoundingClientRect();return b.width&&(b.left<frame.left-1||b.right>frame.right+1)?[{text:n.textContent,left:b.left,right:b.right,frame:[frame.left,frame.right]}]:[];
   });
  });
  assert.deepEqual(outside,[],'Voice/TAB/fingering ink obeys the page width');
  await openPracticeOptions(combined);await tab.uncheck();await voice.uncheck();await dismissPracticeDrawer(combined);
  await expect(combined.locator('.chords-only-score').first()).toBeVisible();
  await expect(combined.locator('.abcjs-lyric').first()).toBeVisible();

  await combined.goto(`${server.base}/piano/hymns/${guitarEditionHymn!.slug}?arrangement=original&mode=playback&stanzas=1`);
  await waitForApp(combined,'.hymn-controls');await openHymnControls(combined);
  await expect(fingerings).toBeEnabled();await fingerings.check();await dismissPracticeDrawer(combined);
  await expect(combined.locator('.hymn-fingering').first()).toBeVisible();
  const pianoOutside=await combined.locator('.hymn-paper').evaluate(paper=>{
   const frame=paper.getBoundingClientRect();
   return [...paper.querySelectorAll<SVGGraphicsElement>('.abcjs-note,.abcjs-lyric,.hymn-fingering,.abcjs-staff-extra')].filter(n=>getComputedStyle(n).visibility!=='hidden').flatMap(n=>{
    const b=n.getBoundingClientRect();return b.width&&(b.left<frame.left-1||b.right>frame.right+1)?[n.textContent]:[];
   });
  });
  assert.deepEqual(pianoOutside,[],'Voice/keyboard signatures, notes and fingerings obey the page width');
  assert(await combined.locator('.hymn-fingering').evaluateAll(nodes=>nodes.every(n=>!(n as HTMLElement).dataset.noteId?.startsWith('0:'))),'Keyboard hints never label Voice');
  await combined.close();
 }

 const higherHymn=await selectOctaveCapableGuitarHymn(),higher=await newPage(browser,{viewport:{width:1440,height:1000}});
 higher.on('pageerror',e=>errors.push(e.message));
 await higher.goto(`${server.base}/piano/hymns/${higherHymn.slug}?arrangement=guitar-edition&key=original&octave=0&display=both&mode=playback`);
 await waitForApp(higher,'.hymn-controls');await expect(higher.locator('.abcjs-tabNumber').first()).toBeVisible();
 const originalFrets=await higher.locator('.abcjs-tabNumber').allTextContents();
 await openPracticeOptions(higher);await expect(higher.locator('#hymn-octave-up')).toBeEnabled();await higher.locator('#hymn-octave-up').click();
 await expect.poll(()=>new URL(higher.url()).searchParams.get('octave')).toBe('1');
 await expect(higher.locator('.abcjs-tabNumber').first()).toBeVisible();
 const raisedFrets=await higher.locator('.abcjs-tabNumber').allTextContents();
 assert(raisedFrets.length>0&&!raisedFrets.some(n=>n.includes('?')),'Higher octave has a complete playable layout');
 assert.notDeepEqual(raisedFrets,originalFrets);await higher.close();
 assert.deepEqual(errors,[]);console.log('PASS: score size, independent staves/chords, saved view options and chord preview schedule');
} catch(error){await captureFailure(browser,error);throw error;}
finally{await closeBrowser(browser);server.stop();}
