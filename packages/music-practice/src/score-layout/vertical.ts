import {scoreInkBox as frameInkBox,scoreStaffSpace,scoreInkSelector as primitiveSelector,visibleScoreInk as visible} from './geometry';
export {scoreInkBox} from './geometry';
// Only lyric text gets shaped-ink contours; framing retains complete text boxes.
const scoreInkBox=(node:SVGGraphicsElement,svg:SVGSVGElement)=>frameInkBox(node,svg,true);
import type {TuneObject,NoteTimingEvent} from 'abcjs';
import {placeVerticalRows,placeOutsideLanes,skyline,type InkBox,type Skyline,type VerticalPlacement} from './skyline';

const ns='http://www.w3.org/2000/svg';
/** Adapters declare ownership of detached editorial ink through its musical
 * anchor. No song IDs, coordinate guesses, or global renderer patches. */
const anchors=new WeakMap<Element,Element>();
export function anchorScoreInk<T extends Element>(node:T,anchor:Element):T {anchors.set(node,anchor);return node;}
export type VerticalDiagnostics={status:'placed'|'unchanged'|'fallback';reason?:string;offsets:number[];saved:number;annotations?:{staff:number;role:string;offset:number}[];contours?:{top:Skyline;bottom:Skyline;staffTop:number;staffBottom:number}[];constraints:VerticalPlacement['constraints']};
const reports=new WeakMap<SVGSVGElement,VerticalDiagnostics>();
export const VERTICAL_SPACING={staffGap:3.5,inkGap:1,systemGap:2,lyricGap:.5} as const;


function transform(node:SVGGraphicsElement,svg:SVGSVGElement,dy:number,sy=1,origin=0){
  const parent=node.parentElement as unknown as SVGGraphicsElement,root=svg.getScreenCTM(),screen=parent.getScreenCTM();
  if(!root||!screen)return;
  const raw=root.inverse().multiply(screen),local=new DOMMatrix([raw.a,raw.b,raw.c,raw.d,raw.e,raw.f]);
  const original=node.transform.baseVal.consolidate()?.matrix;
  const base=original?new DOMMatrix([original.a,original.b,original.c,original.d,original.e,original.f]):new DOMMatrix();
  const shift=new DOMMatrix().translate(0,origin+dy).scale(1,sy).translate(0,-origin);
  const m=local.inverse().multiply(shift).multiply(local).multiply(base);
  node.setAttribute('transform',`matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
}
/** Explicit abcjs 6.5 adapter. All translations happen after instrument/lyric
 * decoration, before framing/export. Unsupported geometry keeps native spacing.
 * Only connectors change height; staff glyphs are translated, never scaled. */
export function placeScoreStaves(svg:SVGSVGElement,tune:TuneObject,enabled=true,view:'notation'|'tab'|'chords'='notation'):VerticalDiagnostics {
  // A rendered system is finalized once; callers may frame it repeatedly.
  const previous=reports.get(svg);if(previous)return structuredClone(previous);
  const done=(report:VerticalDiagnostics)=>{reports.set(svg,report);svg.dataset.scoreVertical=report.status;svg.dataset.scoreVerticalSaved=String(report.saved);if(report.reason)svg.dataset.scoreVerticalReason=report.reason;return structuredClone(report);};
  const fallback=(reason:string)=>done({status:'fallback',reason,offsets:[],saved:0,constraints:[]});
  if(!enabled)return fallback('Explicit source spacing');
  // These are intentional single-layer views. Source notation may be clipped
  // or hidden; its native staff model must not set the lyric baseline.
  if(view==='tab'||view==='chords'){
    const dy=placeVisibleLyrics(svg);
    return done({status:Math.abs(dy)>.05?'placed':'unchanged',offsets:[],saved:0,constraints:[],
      annotations:Math.abs(dy)>.05?[{staff:0,role:'lyrics',offset:dy}]:[]});
  }
  const staffNodes=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-staff')].filter(n=>visible(n)&&!n.closest('[clip-path]'));
  if(staffNodes.length<1)return done({status:'unchanged',offsets:staffNodes.map(()=>0),saved:0,constraints:[]});
  if(svg.querySelector('[clip-path]'))return fallback('Clipped staff geometry');
  const staffBoxes=staffNodes.map(n=>scoreInkBox(n,svg));
  if(staffBoxes.some(b=>!b))return fallback('Missing staff geometry');
  const boxes=staffBoxes as InkBox[];
  if(boxes.some((b,i)=>i>0&&b.top<=boxes[i-1].bottom))return fallback('Non-monotone staff order');
  const ownership=new Map<Element,number>(),voices=new Map<number,number>();
  const groups=tune.engraver?.staffgroups??[];
  let native:any;
  // Native element references disambiguate TAB clones, which can reuse the
  // notation voice's CSS classes. Staff identity comes from the model.
  for(const group of groups){
    const relevant=group.voices?.some((v:any)=>v.children?.some((c:any)=>c.elemset?.some((e:Element)=>e.ownerDocument===svg.ownerDocument&&svg.contains(e))));
    if(!relevant)continue;
    native=group;
    const modelStaffs=group.staffs as {voices:number[]}[];
    if(modelStaffs.length!==staffNodes.length)return fallback('Staff/model visibility mismatch');
    modelStaffs.forEach((staff,index)=>{
      ownership.set(staffNodes[index],index);
      for(const voiceIndex of group.voices.flatMap((voice:any,index:number)=>voice.staff===staff?[index]:[])){
        voices.set(voiceIndex,index);
        const voice=group.voices[voiceIndex];
        for(const object of [...(voice.children??[]),...(voice.otherchildren??[])])for(const element of object?.elemset??[])if(element instanceof SVGElement)ownership.set(element,index);
      }
    });
  }
  if(ownership.size===0)return fallback('Missing native staff ownership');
  const owner=(node:Element,seen=new Set<Element>()):number|undefined=>{
    if(seen.has(node))return;seen.add(node);
    const declared=anchors.get(node);if(declared)return owner(declared,seen);
    const known=ownership.get(node);if(known!==undefined)return known;
    if(node.classList.contains('abcjs-tabNumber')||[...node.classList].some(c=>c.startsWith('tab-rhythm')||c.startsWith('fingerstyle-tab'))){
      const tabs=staffNodes.flatMap((s,i)=>s.querySelectorAll(':scope > path').length===6?[i]:[]);if(tabs.length===1)return tabs[0];
    }
    const voice=[...node.classList].map(c=>c.match(/^abcjs-v(\d+)$/)?.[1]).find(v=>v!==undefined);
    if(voice!==undefined&&voices.has(Number(voice)))return voices.get(Number(voice));
    if(node.parentElement&&node.parentElement!==svg as unknown as Element)return owner(node.parentElement,seen);
  };
  for(const voice of native.voices)for(const object of voice.otherchildren??[]){
    const ends=[object?.anchor1?.parent,object?.anchor2?.parent].flatMap(parent=>parent?.elemset?.flatMap((e:Element)=>{const index=owner(e);return index===undefined?[]:[index];})??[]);
    if(new Set(ends).size>1)return fallback('Cross-staff musical connector');
  }
  // Keep native lyric rows intact. Chord rows and underlay are independent
  // lanes; their extenders move with the underlay, including Hebrew melismas.
  const space=scoreStaffSpace(staffNodes[0],svg)??0;
  if(!(space>0&&Number.isFinite(space)))return fallback('Invalid staff space');
  const laneNodes=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-chord,.abcjs-lyric,.hymn-lyric-extender')].filter(visible);
  const annotations:{staff:number;role:string;offset:number}[]=[];
  // Validate ownership before any movement so a fallback cannot leave half a
  // placement applied. Unknown ink is handled by the atom validation below.
  const rows=boxes.map(b=>({top:b.top,bottom:b.bottom,ink:[] as InkBox[]}));
  const moves:{node:SVGGraphicsElement;staff:number}[]=[],bridges:{node:SVGGraphicsElement;top:number;bottom:number;first:number;last:number}[]=[];
  const wrappers=[...svg.querySelectorAll<SVGGElement>('.abcjs-staff-wrapper')];
  const atoms=[...wrappers.flatMap(w=>[...w.children].flatMap(n=>n.classList.contains('score-ledger-layer')?[...n.children]:[n])),
    ...[...svg.children].filter(n=>!wrappers.includes(n as SVGGElement)&&n instanceof SVGGraphicsElement)] as SVGGraphicsElement[];
  for(const atom of atoms){
    const primitives=atom.matches(primitiveSelector)?[atom]:[...atom.querySelectorAll<SVGGraphicsElement>(primitiveSelector)];
    const ink=primitives.map(node=>({node,box:scoreInkBox(node,svg)})).filter((v):v is {node:SVGGraphicsElement;box:InkBox}=>!!v.box);
    if(!ink.length)continue;
    if(atom.classList.contains('abcjs-bar')){
      // A bar group may contain staff-local repeat dots and a connecting spine.
      for(const item of ink){
        const index=owner(atom);if(index===undefined)return fallback('Unowned bar');
        const b=item.box;
        const first=boxes.findIndex(s=>s.bottom>=b.top-.75);
        let end=boxes.length-1;while(end>0&&boxes[end].top>b.bottom+.75)end--;
        if(first>=0&&end>first&&b.right-b.left<=4)bridges.push({node:item.node,top:b.top,bottom:b.bottom,first,last:end});
        else {rows[index].ink.push({...b,id:'bar'});moves.push({node:item.node,staff:index});}
      }
      continue;
    }
    const b=scoreInkBox(atom,svg);if(!b)continue;
    if(atom.classList.contains('abcjs-brace')||atom.classList.contains('abcjs-bracket')||(atom instanceof SVGPathElement&&atom.parentElement?.classList.contains('abcjs-staff-wrapper')&&!atom.getAttribute('class')&&b.right-b.left<=4&&b.top<=boxes[0].top+1&&b.bottom>=boxes.at(-1)!.bottom-1)){
      let first=0,last=boxes.length-1;
      while(first<last&&boxes[first].bottom<b.top-4)first++;
      while(last>first&&boxes[last].top>b.bottom+4)last--;
      bridges.push({node:atom,top:b.top,bottom:b.bottom,first,last});continue;
    }
    const index=owner(atom);if(index===undefined)return fallback(`Unowned ${atom.getAttribute('class')||atom.tagName}`);
    moves.push({node:atom,staff:index});
    for(const {node,box} of ink)rows[index].ink.push({...box,id:node.getAttribute('class')||node.getAttribute('data-name')||node.tagName});
  }
  for(let staff=0;staff<rows.length;staff++){
    const chord=laneNodes.filter(n=>owner(n)===staff&&n.classList.contains('abcjs-chord'));
    const lyric=laneNodes.filter(n=>owner(n)===staff&&!n.classList.contains('abcjs-chord'));
    const below=(n:SVGGraphicsElement)=>{const b=scoreInkBox(n,svg);return !!b&&(b.top+b.bottom)/2>(boxes[staff].top+boxes[staff].bottom)/2;};
    const lanes=[{nodes:chord.filter(n=>!below(n)),side:'top' as const,role:'chords'},
      {nodes:lyric,side:'bottom' as const,role:'lyrics',compact:true},
      {nodes:chord.filter(below),side:'bottom' as const,role:'chords-below'}].filter(l=>l.nodes.length);
    const fixed=[...svg.querySelectorAll<SVGGraphicsElement>(primitiveSelector)].filter(n=>owner(n)===staff&&!n.closest('.abcjs-chord,.abcjs-lyric,.hymn-lyric-extender,.abcjs-bar,.abcjs-brace,.abcjs-bracket'))
      .flatMap(n=>{const b=scoreInkBox(n,svg);return b?[b]:[];});
    const offsets=placeOutsideLanes(fixed,lanes.map(l=>({side:l.side,compact:'compact' in l&&l.compact,padding:l.role==='lyrics'?space*VERTICAL_SPACING.lyricGap:undefined,ink:l.nodes.flatMap(n=>{
      const ink=n.matches('.abcjs-lyric')&&n.querySelector('tspan')?[...n.querySelectorAll<SVGGraphicsElement>('tspan')]:[n];
      return ink.flatMap(node=>{const b=scoreInkBox(node,svg);return b?[b]:[];});
    })})),space*.5);
    lanes.forEach((lane,i)=>{if(offsets[i]>.05||offsets[i]<-.05){for(const node of lane.nodes)transform(node,svg,offsets[i]);annotations.push({staff,role:lane.role,offset:offsets[i]});}});
  }
  // Remeasure after lane placement. Per-primitive boxes keep separated stems,
  // noteheads and text from becoming one oversized note-group rectangle.
  for(const row of rows)row.ink=[];
  for(const {node,staff} of moves){const primitives=node.matches(primitiveSelector)?[node]:[...node.querySelectorAll<SVGGraphicsElement>(primitiveSelector)];for(const primitive of primitives){const b=scoreInkBox(primitive,svg);if(b)rows[staff].ink.push({...b,id:primitive.getAttribute('class')||primitive.getAttribute('data-name')||primitive.tagName});}}
  const placed=placeVerticalRows(rows,space*VERTICAL_SPACING.staffGap,space*VERTICAL_SPACING.inkGap);
  const contours=rows.map((row,i)=>{const ink=row.ink.map(b=>({...b,top:b.top+placed.offsets[i],bottom:b.bottom+placed.offsets[i]}));return {top:skyline(ink,'top'),bottom:skyline(ink,'bottom'),staffTop:row.top+placed.offsets[i],staffBottom:row.bottom+placed.offsets[i]};});
  if(placed.offsets.every(n=>Math.abs(n)<.05))return done({status:annotations.length?'placed':'unchanged',...placed,saved:0,annotations,contours});
  for(const {node,staff} of moves)if(placed.offsets[staff])transform(node,svg,placed.offsets[staff]);
  for(const bridge of bridges){
    const from=placed.offsets[bridge.first],to=placed.offsets[bridge.last];
    if(from||to)transform(bridge.node,svg,from,(bridge.bottom-bridge.top+to-from)/(bridge.bottom-bridge.top),bridge.top);
  }
  // Keep abcjs's public interaction geometry in the same coordinate space.
  native.staffs.forEach((staff:any,i:number)=>{
    for(const key of ['absoluteY','topLine','bottomLine'])if(Number.isFinite(staff[key]))staff[key]+=placed.offsets[i];
    for(const voice of native.voices.filter((v:any)=>v.staff===staff))for(const child of voice.children??[])
      for(const position of child.notePositions??[])position.y+=placed.offsets[i];
  });
  const delta=placed.offsets.at(-1)!;
  native.height+=delta/3.875;
  const updated=new Set<object>();
  for(const selectable of (tune.engraver as any).selectables??[]){
    const index=owner(selectable.svgEl);if(index===undefined||!selectable.staffPos||updated.has(selectable.staffPos))continue;
    updated.add(selectable.staffPos);
    selectable.staffPos.zero+=placed.offsets[index];selectable.staffPos.height+=delta;
  }
  for(const event of (tune as TuneObject & {noteTimings?:NoteTimingEvent[]}).noteTimings??[])if(event.elements?.flat().some(e=>e&&svg.contains(e as unknown as Node)))event.height=(event.height??0)+delta;
  return done({status:'placed',...placed,saved:-delta,annotations,contours});
}

/** Debug overlay is opt-in and is never part of exported or measured ink. */
export function drawVerticalDiagnostics(svg:SVGSVGElement){
  svg.querySelector('.score-skyline-debug')?.remove();
  const report=reports.get(svg);if(!report)return;
  const group=document.createElementNS(ns,'g');group.classList.add('score-skyline-debug');group.setAttribute('pointer-events','none');
  for(const contour of report.contours??[])for(const side of ['top','bottom'] as const){const path=document.createElementNS(ns,'path');path.setAttribute('d',contour[side].map(s=>`M ${s.left} ${s.edge} H ${s.right}`).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke',side==='top'?'#2563eb':'#ef4444');path.setAttribute('stroke-width','.75');group.append(path);}
  svg.append(group);
}

/** Measurements in physical CSS pixels, relative to the SVG's own frame. */
export function scoreFlowBlock(svg:SVGSVGElement){
  const rect=svg.getBoundingClientRect(),view=svg.viewBox.baseVal;
  // Initial practice rendering and timing-only renders may have a hidden or
  // detached parent. The shared frame already supplies physical dimensions.
  const width=rect.width||parseFloat(svg.style.width),height=rect.height||parseFloat(svg.style.height),scale=width/view.width;
  const ink=svg.querySelector('[clip-path]')?undefined:[...svg.querySelectorAll<SVGGraphicsElement>(primitiveSelector)].flatMap(node=>{
    const b=scoreInkBox(node,svg);return b?[{left:(b.left-view.x)*scale,right:(b.right-view.x)*scale,top:(b.top-view.y)*scale,bottom:(b.bottom-view.y)*scale}]:[];
  });
  const staff=svg.querySelector<SVGGraphicsElement>('.abcjs-staff');
  const space=(staff?scoreStaffSpace(staff,svg)??7.75:7.75)*scale;
  const requested=svg.dataset.scoreSystemGap===undefined?undefined:Number(svg.dataset.scoreSystemGap);
  return {width,height,ink,clearance:requested??(Number.isFinite(space)&&space>0?space*VERTICAL_SPACING.systemGap:12)};
}


function placeVisibleLyrics(svg:SVGSVGElement){
  const lyrics=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-lyric,.hymn-lyric-extender')].filter(visible);
  const words=lyrics.flatMap(node=>node.matches('.abcjs-lyric')&&node.querySelector('tspan')?[...node.querySelectorAll<SVGGraphicsElement>('tspan')]:[node]);
  const ink=words.flatMap(n=>{const b=scoreInkBox(n,svg);return b?[b]:[];});
  if(!ink.length)return 0;
  const fixed=[...svg.querySelectorAll<SVGGraphicsElement>(primitiveSelector)].filter(n=>!n.closest('.abcjs-lyric,.hymn-lyric-extender,.abcjs-bar,.chord-chart-bars'))
    .flatMap(n=>{const b=scoreInkBox(n,svg);return b?[b]:[];});
  const staff=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-staff')].find(visible);
  // Use notation staff units even when the visible layer is six-string TAB.
  const space=staff&&staff.querySelectorAll(':scope > path').length===5?scoreStaffSpace(staff,svg)??7.75:7.75;
  const [dy]=placeOutsideLanes(fixed,[{side:'bottom',ink,compact:true}],space*VERTICAL_SPACING.lyricGap);
  if(Math.abs(dy)>.05)for(const node of lyrics)transform(node,svg,dy);
  return dy;
}
