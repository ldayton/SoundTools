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
