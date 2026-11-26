import assert from "node:assert/strict";
import {build} from "esbuild";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {qualityViolations} from "./score-layout-quality";
import type {Page} from "@playwright/test";
import type * as Fixture from "../test-fixtures/score-layout";

declare global { interface Window { ScoreLayoutFixture: typeof Fixture } }

export async function prepareScoreLayoutFixture(page: Page) {
  const bundle=await build({entryPoints:[new URL('../test-fixtures/score-layout.ts',import.meta.url).pathname],
    bundle:true,write:false,format:"iife",globalName:"ScoreLayoutFixture",platform:"browser"});
  const font=await readFile(new URL('../test-fixtures/score-layout-assets/Tinos-Regular.woff2',import.meta.url));
  const fontSha256=createHash('sha256').update(font).digest('hex');
  assert.equal(fontSha256,'90a44b1ca994c9f23f23a5d7417843bcdd3b88e87e5bd342d00205d6301dd453');
  await page.goto('about:blank');
  await page.addStyleTag({content:'body{margin:0;background:#fff;color:#111} svg text,svg tspan{font-family:ScoreFixture!important;font-weight:400!important;font-style:normal!important}'});
  await page.evaluate(async data=>{
    const face=new FontFace('ScoreFixture',`url(data:font/woff2;base64,${data})`);
    document.fonts.add(await face.load());await document.fonts.ready;
  },font.toString('base64'));
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  return {fontSha256,bundleSha256:createHash('sha256').update(bundle.outputFiles[0].text).digest('hex')};
}

/** Small deterministic browser witnesses in the existing CI owner. */
export async function checkScoreLayoutComponent(page: Page) {
  await prepareScoreLayoutFixture(page);
  assert.deepEqual(await page.evaluate(()=>window.ScoreLayoutFixture.inkVisibilityWitness()),[true,false,false,false,false,false],'Only painted ink participates: visible children override inherited visibility, while ancestor display/opacity still suppress ink');
  const errors: string[]=[];page.on('pageerror',error=>errors.push(error.message));
  for(const kind of ["piano","guitar","hebrew"] as const) {
    let audio: unknown;
    const lines: number[]=[];
    for(const width of [320,600,1000]) {
      const result=await page.evaluate(({width,kind})=>window.ScoreLayoutFixture.renderLayoutFixture(width,kind),{width,kind});
      assert(result.lyrics>0,`${kind} fixture has actual lyric ink`);
      if(kind==="guitar") assert(result.tabs>0,"Tab survives explicit measured breaks");
      assert(result.frames.every(frame=>frame.scale===1.25),"Reflow keeps the requested glyph size");
      assert(result.geometry.every(box=>Math.abs(box.scale-1.25)<.001),"Actual SVG glyph scale matches the selected size");
      assert(result.geometry.every(box=>Math.abs(box.wrapperHeight-box.svgHeight)<.1 && box.wrapperPadding===0),"System wrappers match final ink, with no stale aspect-ratio whitespace");
      assert(result.plan && result.plan.sections.length>0);
      lines.push(result.plan.sections.reduce((sum,section)=>sum+section.systems.length,0));
      if(audio) assert.deepEqual(result.audio,audio,"Layout preserves every sounding pitch and duration");
      audio=result.audio;
      const again=await page.evaluate(({width,kind})=>window.ScoreLayoutFixture.renderLayoutFixture(width,kind),{width,kind});
      assert.deepEqual(again.plan,result.plan,"Cached measurements yield the same plan");
    }
    assert(lines[0]>lines[2],`${kind} places more music on wide systems`);
  }
  const hiddenStartup=await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(600,'guitar',1.25,{hidden:true}));
  const detachedTiming=await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(600,'guitar',1.25,{detached:true}));
  const revealed=await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(600,'guitar'));
  assert.deepEqual(detachedTiming.audio,revealed.audio,'Detached timing-only renders never require visual system packing');
  assert.deepEqual(hiddenStartup.audio,revealed.audio,'Hidden startup/timing renders preserve playback without requiring a painted rectangle');
  const refitted=await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(600,'guitar',1.25,{refit:true}));
  assert.deepEqual(refitted.audio,revealed.audio);
  for(let system=0;system<revealed.placedGeometry.length;system++)for(let head=0;head<revealed.placedGeometry[system].heads.length;head++){
    const a=revealed.placedGeometry[system].heads[head],b=refitted.placedGeometry[system].heads[head];
    assert(Math.abs(a.top-b.top)<.01&&Math.abs(a.left-b.left)<.01,'Repeated finalization never accumulates staff/annotation displacement');
  }
  for(const kind of ['skyline','skyline-collision','skyline-unknown','skyline-explicit'] as const){
    const result=await page.evaluate(kind=>window.ScoreLayoutFixture.renderLayoutFixture(1000,kind),kind);
    assert(result.retainedReferences,'Placement preserves note element identity for playback and selection');
    assert.deepEqual(result.audio,result.nativeAudio,'Vertical layout changes no sounding pitches, durations or source events');
    const before=result.nativeGeometry[0],after=result.placedGeometry[0],report=result.diagnostics.vertical[0];
    const nativeGap=before.staffs[1].top-before.staffs[0].top,placedGap=after.staffs[1].top-after.staffs[0].top;
    if(kind==='skyline')assert(nativeGap-placedGap>20,'Opposite-side protrusions recover actual inter-staff space');
    if(kind==='skyline-collision')assert(placedGap>nativeGap+5,'Real facing protrusions retain an ink clearance');
    if(kind==='skyline-unknown'||kind==='skyline-explicit'){
      assert.equal(report.status,'fallback');assert(report.reason);
      assert(Math.abs(nativeGap-placedGap)<.01,'Unsupported or explicit spacing stays intact');
    }else{
      assert(Math.abs(placedGap-nativeGap-report.offsets[1])<.01,'Reported displacement matches independent painted geometry');
      assert(kind==='skyline'?after.bridges[0].height<before.bridges[0].height:after.bridges[0].height>before.bridges[0].height,'Brace follows the new staff span');
    }
    for(let i=0;i<before.heads.length;i++){
      assert(Math.abs(before.heads[i].left-after.heads[i].left)<.01,'Vertical placement preserves every rhythmic x anchor');
      assert(Math.abs(before.heads[i].height-after.heads[i].height)<.01&&Math.abs(before.heads[i].width-after.heads[i].width)<.01,'Glyphs are translated, never stretched');
      const staff=i<4?0:1;
      assert(Math.abs(before.heads[i].top-before.staffs[staff].top-after.heads[i].top+after.staffs[staff].top)<.01,'Notes keep their written pitches relative to their staff');
    }
  }
  const flowWitness=await page.evaluate(()=>{
    window.ScoreLayoutFixture.renderLayoutFixture(600,'skyline-flow');
    const svgs=[...document.querySelectorAll<SVGSVGElement>('#layout-fixture svg')],next=svgs[1].getBoundingClientRect();
    const head=svgs[0].querySelector('.abcjs-notehead')!,r=head.getBoundingClientRect();
    let painted=0,blocked=0;
    for(let ix=1;ix<10;ix++)for(let iy=1;iy<10;iy++){
      const x=r.x+r.width*ix/10,y=r.y+r.height*iy/10;
      if(y<next.top||y>next.bottom)continue;
      const target=document.elementFromPoint(x,y);
      if(target?.closest('svg')===svgs[0])painted++;
      if(target?.closest('svg')===svgs[1])blocked++;
    }
    return {overlap:parseFloat(svgs[1].parentElement!.style.marginTop),painted,blocked};
  });
  assert(flowWitness.overlap<-20,'System contours recover whitespace without shrinking music');
  assert(flowWitness.painted>0&&flowWitness.blocked===0,'An overlapping blank SVG viewport never blocks the preceding note');
  await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(600,'guitar'));
  const ink = await page.evaluate(()=>({
    ledgers:[...document.querySelectorAll('.abcjs-ledger')].filter(node=>getComputedStyle(node).visibility==='visible').map(node=>({
      layer:node.parentElement?.classList.contains('score-ledger-layer'),
      first:node.parentElement===node.parentElement?.parentElement?.firstElementChild,
    })),
    staffs:[...document.querySelectorAll('.abcjs-staff')].filter(node=>node.querySelectorAll(':scope > path').length===6).map(node=>{
      const id=node.getAttribute('data-score-tab-mask');
      const mask=id?document.getElementById(id):null;
      return {mask:node.getAttribute('mask'),gaps:mask?.querySelectorAll('rect[fill="black"]').length??0};
    }),
    notation:[...document.querySelectorAll('.abcjs-staff')].filter(node=>node.querySelectorAll(':scope > path').length===5).every(node=>!node.hasAttribute('mask')),
  }));
  assert(ink.ledgers.length>0 && ink.ledgers.every(node=>node.layer&&node.first),'Ledger ink is behind all voices, including highlighted filled heads');
  assert(ink.staffs.length>0 && ink.staffs.every(staff=>staff.mask&&staff.gaps>0),'Tab strings have explicit number-sized gaps that survive SVG export');
  assert(ink.notation,'Tab gaps never mask the notation staff');
  const highlighted = await page.evaluate(async()=>{
    const svg=document.querySelector<SVGSVGElement>('#layout-fixture svg')!;
    const ledger=svg.querySelector<SVGGraphicsElement>('.abcjs-ledger')!;
    const line=ledger.getBoundingClientRect();
    const head=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-note path:not(.abcjs-stem)')].find(node=>{
      const box=node.getBoundingClientRect();
      return box.y<line.y && box.bottom>line.bottom && box.x<line.x+line.width/2 && box.right>line.x+line.width/2;
    })!;
    head.style.fill='#007b57';
    const point=new DOMPoint(line.x+line.width/2,line.y+line.height/2).matrixTransform(svg.getScreenCTM()!.inverse());
    const box=svg.viewBox.baseVal,clone=svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
    clone.setAttribute('width',String(box.width*4));clone.setAttribute('height',String(box.height*4));
    const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(clone));await image.decode();
    const canvas=document.createElement('canvas');canvas.width=box.width*4;canvas.height=box.height*4;
    const context=canvas.getContext('2d')!;context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0);
    const digit=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-tabNumber text')].find(node=>node.textContent==='0')!;
    const digitBox=digit.getBoundingClientRect();
    const staff=svg.querySelector<SVGGraphicsElement>('.abcjs-staff[mask]')!;
    const string=[...staff.querySelectorAll<SVGGraphicsElement>('path')].map(node=>node.getBoundingClientRect()).sort((a,b)=>Math.abs(a.y-(digitBox.y+digitBox.height/2))-Math.abs(b.y-(digitBox.y+digitBox.height/2)))[0];
    const gap=new DOMPoint(digitBox.x-.75*(svg.getScreenCTM()!.a),string.y+string.height/2).matrixTransform(svg.getScreenCTM()!.inverse());
    return {head:[...context.getImageData(Math.floor((point.x-box.x)*4),Math.floor((point.y-box.y)*4),1,1).data],gap:[...context.getImageData(Math.floor((gap.x-box.x)*4),Math.floor((gap.y-box.y)*4),1,1).data]};
  });
  assert(highlighted.head[1]>highlighted.head[0]+50 && highlighted.head[1]>highlighted.head[2],'Serialized/exported SVG paints the highlighted filled note over the ledger line');

  assert(highlighted.gap.slice(0,3).every(channel=>channel>245),'Exported SVG has white clearance between a fret digit and its string line');
  // Compare cold engraving with cached layout, then return to the same width
  // after crossing component and shell breakpoint neighbourhoods.
  const reference=await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(600,'verses'));
  const swapped=await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(600,'verses',1.25,{reverseVerses:true}));
  assert.equal(swapped.noteXs.length,reference.noteXs.length);
  // Font measurement/serialization can differ far below a physical pixel.
  // 0.05 engraving units is <0.1 CSS px at this fixture's scale, not permission
  // to accept visible movement or a changed break plan.
  assert(swapped.noteXs.every((x,i)=>Math.abs(x-reference.noteXs[i])<.05),'Verse order preserves horizontal placement within subpixel precision');
  assert.deepEqual(swapped.plan?.sections.map(section=>section.breaks),reference.plan?.sections.map(section=>section.breaks),'Verse order does not change system breaks');
  const cold=await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(600,'verses',1.25,{cold:true}));
  assert.deepEqual(cold.plan,reference.plan,'Cold and cached measurement agree');
  for(const width of [319,320,321,599,600,601,1119,1120,600]) {
    const result=await page.evaluate(width=>window.ScoreLayoutFixture.renderLayoutFixture(width,'verses'),width);
    assert(result.geometry.every(box=>Math.abs(box.scale-1.25)<.001),'Resize preserves physical staff size');
    const quality=await page.evaluate(()=>window.ScoreLayoutFixture.measureLayoutQuality());
    assert.deepEqual(qualityViolations(quality),[],`Space-quality contract at ${width}px: ${JSON.stringify(quality)}`);
    assert.deepEqual(result.audio,reference.audio,'Resize preserves the musical signature');
    if(width===600) assert.deepEqual(result.plan,reference.plan,'Round-trip resize restores the original layout');
  }
  await page.locator('#layout-fixture').evaluate(element=>(element as HTMLElement).style.paddingTop='200px');
  const padded=await page.evaluate(()=>window.ScoreLayoutFixture.measureLayoutQuality());
  assert(qualityViolations(padded).some(error=>error.includes('scroll height')),'Independent metrics detect injected wrapper whitespace');
  await page.locator('#layout-fixture').evaluate(element=>(element as HTMLElement).style.paddingTop='');
  const opening=await page.evaluate(()=>{
    const result=window.ScoreLayoutFixture.renderLayoutFixture(280,'headers');
    return {audio:result.audio,plan:result.plan,diagnostics:result.diagnostics,lines:[...document.querySelectorAll<SVGSVGElement>('#layout-fixture svg')].map(svg=>({
      clefs:svg.querySelectorAll('.abcjs-clef').length,keys:svg.querySelectorAll('.abcjs-key-signature').length,
      x:svg.querySelector<SVGGraphicsElement>('.abcjs-note')!.getBBox().x,
    }))};
  });
  assert(opening.plan?.sections.some(section=>section.systems.some(system=>system.naturalWidth>system.minimumWidth+1)),'Natural and compressed probes measure distinct widths');
  assert(opening.lines.length>2 && opening.lines[0].clefs>0);
  assert(opening.lines.slice(1).every(line=>line.clefs===0),'Unchanged clefs consume no continuation ink');
  assert.equal(opening.lines.reduce((sum,line)=>sum+line.keys,0),2,'Initial signature and one genuine change print exactly once');
  assert(opening.lines.slice(1).some(line=>line.keys>0),'A genuine key change survives reflow');
  assert(opening.lines.slice(1).some(line=>line.keys===0&&line.x<opening.lines[0].x/2),'Continuation notes use the recovered header space');
  const starts=opening.diagnostics.sections[0].startWidths!;
  assert(starts[1]<starts[0]/2,'Measurements distinguish opening and unchanged continuation headers');
  const wideOpening=await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(800,'headers'));
  assert.deepEqual(wideOpening.audio,opening.audio,'Header measurement preserves key changes and every sounding pitch');
  await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(600,'polyphony'));
  const polyphony=await page.evaluate(()=>window.ScoreLayoutFixture.measureLayoutQuality());
  assert.deepEqual(qualityViolations(polyphony),[],'Dense lower voices align with the sparse upper voice');
  await page.locator('#layout-fixture .abcjs-note.abcjs-v1').first().evaluate(node=>node.setAttribute('transform','translate(20 0)'));
  const misaligned=await page.evaluate(()=>window.ScoreLayoutFixture.measureLayoutQuality());
  assert(qualityViolations(misaligned).some(error=>error.includes('simultaneous voices misaligned')),'Actual lower-voice displacement is detected independently of the planner');
  await page.locator('#layout-fixture .abcjs-note.abcjs-v1').first().evaluate(node=>node.setAttribute('transform','translate(0 -150)'));
  const overlapping=await page.evaluate(()=>window.ScoreLayoutFixture.measureLayoutQuality());
  assert(qualityViolations(overlapping).some(error=>error.includes('collision between staves')),'Independent observer detects a lower-staff note intruding into the upper staff');
  const sections=await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(600,'sections'));
  assert.equal(sections.plan?.sections.length,2,'Separated music sections retain independent plans');
  assert(sections.diagnostics.sections.every(section=>section.bars.some(bar=>bar.naturalWidth>bar.minimumWidth)),'Every section receives an unconstrained natural probe, including non-final sections');
  const underlays=await page.evaluate(()=>['none','short','long','sparse'].map(underlay=>{
    const result=window.ScoreLayoutFixture.renderLayoutFixture(1000,'underlay',1.25,{underlay:underlay as 'none'|'short'|'long'|'sparse'});
    return {audio:result.audio,bars:result.diagnostics.sections[0].bars,quality:window.ScoreLayoutFixture.measureLayoutQuality()};
  }));
  underlays.slice(1).forEach(result=>assert.deepEqual(result.audio,underlays[0].audio,'Lyric clearance cannot alter the musical timeline'));
  // Compare comfortable spacing, not the no-lyrics collision minimum: at
  // that minimum even 'a' needs extra clearance. Allow one staff space for
  // word/barline clearance, without multiplying every rhythmic gap.
  assert(underlays[1].bars.every((bar,i)=>bar.naturalWidth<=underlays[0].bars[i].naturalWidth+7.75),'Short syllables do not inflate comfortable rhythmic spacing beyond barline clearance');
  assert(underlays[2].bars.every((bar,i)=>bar.minimumWidth>underlays[1].bars[i].minimumWidth),'Long syllables contribute real collision constraints');
  assert.deepEqual(qualityViolations(underlays[3].quality),[],'Sparse pointed-Hebrew melismas remain clear without padding every sung note');
  await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(600,'tab-symbols'));
  assert.equal(await page.locator('.guitar-position').count(),1,'Simultaneous voices share one TAB position mark');
  assert.equal(await page.locator('.guitar-fermata').count(),1,'Simultaneous fermatas are drawn once in TAB');
  for(const width of [260,600]) {
    await page.evaluate(width=>window.ScoreLayoutFixture.renderLayoutFixture(width,'repeat-numbers'),width);
    const numbers=await page.locator('.abcjs-bar-number').allTextContents();
    assert(numbers.includes('4') && !numbers.includes('5'),`Empty opening repeats cannot create an extra numbered measure: ${numbers}`);
  }
  const hidden=await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(600,"hidden-ink"));
  assert(hidden.frames.every(frame=>frame.height<600),"Invisible ink cannot restore a blank area above a system");
  const clipped=await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(600,"clipped-ink"));
  assert(clipped.frames.every(frame=>frame.height<600),"Clipped ink cannot restore the cropped source staff");
  const partial=await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(600,"partial"));
  assert.equal(partial.plan?.sections[0].systems.at(-1)?.to,8,"A trailing measure without a barline is included in the plan");
  const dense=await page.evaluate(()=>window.ScoreLayoutFixture.renderLayoutFixture(160,"dense"));
  assert(dense.frames.some(frame=>frame.overflow>0),"Indivisible dense content reports overflow");
  assert(dense.geometry.every(box=>Math.abs(box.scale-1.25)<.001),"Dense SVG glyphs retain real physical scale");
  assert(dense.frames.every(frame=>frame.scale===1.25),"Dense bars are not silently shrunk");
  assert(await page.locator('#layout-fixture').evaluate(el=>el.scrollWidth>el.clientWidth),"Dense ink has a local scroll surface");
  assert.deepEqual(errors,[]);
}
