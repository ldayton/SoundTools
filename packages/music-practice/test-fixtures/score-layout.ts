import {rhythmQuality,type RhythmAnchor} from "../browser-tests/score-rhythm-quality";
export {compareLayoutPixels,layoutComparatorSamples} from "./score-layout-images";
/** Independent engraving fixtures; intentionally unrelated to product songs. */
import {AbcScoreLayout} from "../src/score-layout/abc";
import {initialHymnSignatures} from "../src/hymn-signatures";
import {showOnlyTab} from "../src/fingerstyle-tab";
import {prepareScoreMarkings,restoreSystemBarNumbers} from "../src/score-markings";

let lastTune:ReturnType<AbcScoreLayout["render"]>|undefined;
const melody='"C"C D E F | "G"G A B c | "Am"c B A G | "F"F E D C | "C"C2 E2 | "G"G2 B2 | "F"A G F E | "C"C4 |]';
const english='one two three four five six sev en eight nine ten now sing this tune well hold this note here end this phrase now rest';
const hebrew='מַה טּוֹב לָנוּ שִׁיר חָדָשׁ בַּלֵּב אוֹר בָּא כָּאן עוֹד שִׁיר נָעִים לִי הַיּוֹם טוֹב לָנוּ אוֹר לָנוּ שִׁיר עוֹד כָּאן לֵב שָׁלוֹם';
export type LayoutFixtureKind = "piano"|"guitar"|"hebrew"|"dense"|"hidden-ink"|"clipped-ink"|"partial"|"verses"|"sparse"|"headers"|"polyphony"|"sections"|"underlay"|"tab-symbols"|"repeat-numbers"|"skyline"|"skyline-collision"|"skyline-unknown"|"skyline-explicit"|"skyline-flow";
export type LayoutFixtureOptions = { reverseVerses?:boolean; cold?:boolean; hidden?:boolean; detached?:boolean; refit?:boolean; underlay?:"none"|"short"|"long"|"sparse" };
export const layoutVisualCases = [
  {id:"piano-phone",kind:"piano",width:320},
  {id:"piano-desktop",kind:"piano",width:800},
  {id:"guitar-phone",kind:"guitar",width:320},
  {id:"guitar-desktop",kind:"guitar",width:800},
  {id:"hebrew-phone",kind:"hebrew",width:320},
  {id:"verses-desktop",kind:"verses",width:800},
  {id:"sparse-desktop",kind:"sparse",width:800},
] as const;
export function renderLayoutFixture(width: number, kind: LayoutFixtureKind, scale=1.25, options: LayoutFixtureOptions={}) {
  const lyrics=kind==="dense"?Array(25).fill('ExtraordinarilyLongUnbreakableSyllable').join(' '):kind==="hebrew"?hebrew:english;
  let source=kind==="piano" ? `X:1\nM:4/4\nL:1/4\n%%score { RH LH }\nV:RH clef=treble\nV:LH clef=bass\nK:C\n[V:RH] ${melody}\nw: ${lyrics}\n[V:LH] C,4 | G,,4 | A,,4 | F,,4 | C,4 | G,,4 | F,,4 | C,4 |]`
    : `X:1\nM:4/4\nL:1/4\nK:C\n${melody}\nw: ${lyrics}`;
  if(kind==="verses") {
    const rows=[english,hebrew];
    if(options.reverseVerses) rows.reverse();
    source=source.replace(/w:.*$/,rows.map(row=>`w: ${row}`).join('\n'));
  }
  if(kind==="headers") source='X:1\nM:4/4\nL:1/4\nK:D\nD E F G | A B c d | [K:G] G A B c | d c B A | G A B c | d c B A | G4 |]';
  if(kind==="tab-symbols")source='X:1\nM:4/4\nL:1/4\n%%score ( A B )\nV:A clef=treble stem=up\nV:B clef=treble stem=down\nK:C\n[V:A] "^III"!fermata!E4 |]\n[V:B] "^III"!fermata!C4 |]';
  if(kind==="repeat-numbers")source='X:1\nM:4/4\nL:1/4\n%%barnumbers 1\nK:C\n|: C4 | D4 | E4 :|\nP:Ending\nF4 |]';
  if(kind==="underlay") {
    source='X:1\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c | c B A G | F E D C |]';
    if(options.underlay!=="none")source+='\nw: '+(options.underlay==="long"?Array(16).fill('extraordinarily').join(' '):options.underlay==="sparse"?Array(4).fill('שָׁלוֹם _ _ _').join(' '):Array(16).fill('a').join(' '));
  }
  if(kind==="sections") source='X:1\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |\n%%text Second section\nA B c d | c B A G |]';
  if(kind==="polyphony") source='X:1\nM:4/4\nL:1/8\n%%score { RH LH }\nV:RH clef=treble\nV:LH clef=bass\nK:C\n[V:RH] C8 | E4 G4 | C8 |]\n[V:LH] C, D, E, F, G, A, B, C | C,2 E,2 G,2 C2 | C,8 |]';
  if(kind.startsWith('skyline'))source=`X:1\nM:4/4\nL:1/4\n%%score { RH LH }\n${kind==='skyline-explicit'?'%%sysstaffsep 80\n':''}V:RH clef=treble\nV:LH clef=bass\nK:C\n[V:RH] C,4 | c4 | c4 | c4 |]\n[V:LH] ${kind==='skyline-collision'?'c4 | C,4 | C,4 | C,4':'C,4 | C,4 | C,4 | c4'} |]`;
  if(kind==='skyline-flow')source='X:1\nM:4/4\nL:1/4\nK:C\nC,4 | c4 |\nP:Second\nc4 | c\'\'4 |]';
  if(kind==="sparse") source='X:1\nM:4/4\nL:1/4\nK:C\nC4 | G4 | C4 |]';
  let host=document.getElementById('layout-fixture-host');
  if(!host) {host=document.createElement('div');host.id='layout-fixture-host';document.body.append(host);}
  host.style.width=`${width}px`;host.style.display=options.hidden?'none':'block';
  let paper=document.getElementById('layout-fixture')!;
  if(!paper) {paper=document.createElement('div');paper.id='layout-fixture';host.append(paper);}
  if(options.detached)host.remove();
  let restoreHeaders:(()=>void)|undefined;
  const layout=new AbcScoreLayout({source:kind==="partial"?source.replace(/\|\]\nw:/,"\nw:"):source,width,scale,mode:"reflow",params:{add_classes:true,
    tablature:(kind==="guitar"||kind==="tab-symbols")?[{instrument:"guitar"}]:undefined,
    afterParsing:tune=>{prepareScoreMarkings(tune,kind==="repeat-numbers");if(kind==="headers"||kind==="repeat-numbers")restoreHeaders=initialHymnSignatures(tune);return tune;},
  },measurementContext:options.cold?undefined:[kind,options.reverseVerses]});
  const tune=layout.render(paper);
  restoreHeaders?.();
  lastTune=tune;
  if(kind==="tab-symbols")showOnlyTab(paper);
  if(kind==="repeat-numbers")restoreSystemBarNumbers(tune,paper);
  const nativeGeometry=[...paper.querySelectorAll('svg')].map(observeVerticalGeometry);
  const retained=[...paper.querySelectorAll('.abcjs-note')];
  const nativeAudio=tune.setUpAudio({chordsOff:true}).tracks.map(track=>track.flatMap(e=>e.cmd==='note'?[[e.pitch,e.start,e.duration]]:[]));
  const frames=[...paper.querySelectorAll('svg')].map(svg=>{
    if(kind==='skyline-unknown') {
      const unknown=document.createElementNS('http://www.w3.org/2000/svg','rect');
      unknown.setAttribute('x','25');unknown.setAttribute('y','25');unknown.setAttribute('width','3');unknown.setAttribute('height','3');svg.append(unknown);
    }
    if(kind==="hidden-ink") {
      const hidden=document.createElementNS('http://www.w3.org/2000/svg','rect');
      hidden.setAttribute('x','-500');hidden.setAttribute('y','-1000');
      hidden.setAttribute('width','500');hidden.setAttribute('height','1000');
      hidden.style.visibility='hidden';svg.append(hidden);
    }
    if(kind==="clipped-ink") {
      const ns='http://www.w3.org/2000/svg';
      const defs=document.createElementNS(ns,'defs'),clip=document.createElementNS(ns,'clipPath');
      clip.id=`fixture-clip-${paper.querySelectorAll('clipPath').length}`;
      const bounds=document.createElementNS(ns,'rect');
      bounds.setAttribute('x','10');bounds.setAttribute('y',String(svg.viewBox.baseVal.y+10));bounds.setAttribute('width','20');bounds.setAttribute('height','20');
      clip.append(bounds);defs.append(clip);svg.append(defs);
      const clipped=document.createElementNS(ns,'rect');
      clipped.setAttribute('x','10');clipped.setAttribute('y',String(svg.viewBox.baseVal.y-1000));clipped.setAttribute('width','20');clipped.setAttribute('height','1020');
      clipped.setAttribute('clip-path',`url(#${clip.id})`);svg.append(clipped);
    }
    return layout.fit(svg);
  });
  if(options.refit)paper.querySelectorAll('svg').forEach(svg=>layout.fit(svg));
  layout.finish();
  if(options.refit)layout.finish();
  if(options.detached)document.body.append(host);
  const geometry=[...paper.querySelectorAll('svg')].map(svg=>({
    scale:svg.getScreenCTM()?.a||0,
    svgHeight:svg.getBoundingClientRect().height,
    wrapperHeight:svg.parentElement!.getBoundingClientRect().height,
    wrapperPadding:parseFloat(getComputedStyle(svg.parentElement!).paddingBottom),
  }));
  const noteXs=[...paper.querySelectorAll<SVGGraphicsElement>('.abcjs-note')]
    .filter(node=>!node.classList.contains('abcjs-tabNumber'))
    .map(node=>Math.round(node.getBBox().x*1000)/1000);
  const audio=tune.setUpAudio({chordsOff:true});
  return {nativeGeometry,placedGeometry:[...paper.querySelectorAll('svg')].map(observeVerticalGeometry),
    retainedReferences:retained.every(n=>n.isConnected&&paper.contains(n)),nativeAudio,
    plan:layout.plan,diagnostics:layout.diagnostics,frames,geometry,noteXs,lyrics:paper.querySelectorAll('.abcjs-lyric').length,
    tabs:paper.querySelectorAll('.abcjs-tabNumber').length,
    audio:audio.tracks.map(track=>track.flatMap(event=>event.cmd==="note"?[[event.pitch,event.start,event.duration]]:[]))};
}


export function measureLayoutQuality() {
  const paper=document.getElementById('layout-fixture')!;
  const staffSpace=7.75*Number(paper.querySelector<SVGSVGElement>('svg')?.dataset.scoreScale||1);
  const systems=[...paper.querySelectorAll('svg')].map(svg=>{
    const box=svg.getBoundingClientRect();
    const notes=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-note')]
      .filter(node=>!node.classList.contains('abcjs-tabNumber')&&getComputedStyle(node).visibility!=='hidden')
      .map(node=>node.getBoundingClientRect());
    const positions=[...new Set(notes.map(note=>Math.round((note.left-box.left)*100)/100))].sort((a,b)=>a-b);
    const gaps=positions.slice(1).map((x,i)=>(x-positions[i])/staffSpace);
    const staffInk:DOMRect[][]=[];
    const anchors:RhythmAnchor[]=[];
    for(const line of lastTune?.lines||[])for(const staff of line.staff||[]) {
      const row:DOMRect[]=[];
      for(const voice of staff.voices||[]) {
        let time=0;
        for(const item of voice) {
          if(item.el_type!=="note")continue;
          const absolute=(item as typeof item & {abselem?:{x:number;elemset:SVGGraphicsElement[]}}).abselem;
          const element=absolute?.elemset[0],matrix=element?.getScreenCTM();
          if(element?.ownerSVGElement===svg && matrix && getComputedStyle(element).visibility!=="hidden") {
            row.push(element.getBoundingClientRect());
            if(!item.rest && item.duration>0)anchors.push({time,x:new DOMPoint(absolute!.x,0).matrixTransform(matrix).x});
          }
          time+=item.duration;
        }
      }
      if(row.length)staffInk.push(row);
    }
    // Cross-staff clearance depends on horizontal overlap, not just each
    // row's tallest/widest object. This observer is independent of planning.
    let staffCollisions=0;
    for(let row=1;row<staffInk.length;row++)for(const upper of staffInk[row-1])for(const lower of staffInk[row])
      if(Math.min(upper.right,lower.right)-Math.max(upper.left,lower.left)>1 && upper.bottom>lower.top+1)staffCollisions++;
    const rhythm=rhythmQuality(anchors,staffSpace);
    const words=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-lyric')].map(node=>node.getBoundingClientRect());
    const lyricCollisions=words.flatMap((a,i)=>words.slice(i+1).filter(b=>Math.abs(a.top-b.top)<staffSpace/2&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>1));
    const lyricCrowding=words.filter(a=>words.some(b=>b.left>a.left&&Math.abs(a.top-b.top)<staffSpace/2&&(b.left-a.right)/staffSpace<.25)).length;
    const ink=[...svg.querySelectorAll<SVGGraphicsElement>('path,text,line,rect')]
      .filter(node=>!node.closest('defs')&&getComputedStyle(node).visibility!=='hidden')
      .map(node=>node.getBoundingClientRect()).filter(rect=>rect.width||rect.height);
    const top=ink.length?Math.min(...ink.map(rect=>rect.top)):box.top;
    const bottom=ink.length?Math.max(...ink.map(rect=>rect.bottom)):box.bottom;
    return {height:box.height/staffSpace,topBlank:(top-box.top)/staffSpace,bottomBlank:(box.bottom-bottom)/staffSpace,
      maxNoteGap:gaps.length?Math.max(...gaps):0,...rhythm,staffCollisions,lyricCollisions:lyricCollisions.length,lyricCrowding,
      overflows:ink.filter(rect=>rect.left<box.left-1||rect.right>box.right+1||rect.top<box.top-1||rect.bottom>box.bottom+1).length};
  });
  return {staffSpace,viewportOverflow:Math.max(0,paper.scrollWidth-paper.clientWidth)/staffSpace,scrollHeight:paper.scrollHeight/staffSpace,systems};
}

/** Independent browser observer: actual painted rectangles, normalized by the
 * SVG's physical scale. Does not call production contour/placement helpers. */
function observeVerticalGeometry(svg:SVGSVGElement) {
  const root=svg.getScreenCTM();if(!root)return {staffs:[],heads:[],bridges:[]};
  const scale=Math.hypot(root.a,root.b),origin=new DOMPoint(0,0).matrixTransform(root);
  const bounds=(node:Element)=>{const r=node.getBoundingClientRect();return {left:(r.left-origin.x)/scale,top:(r.top-origin.y)/scale,width:r.width/scale,height:r.height/scale};};
  const staffs=[...svg.querySelectorAll('.abcjs-staff')].map(bounds);
  const heads=[...svg.querySelectorAll('.abcjs-notehead')].map(bounds);
  const bridges=[...svg.querySelectorAll('.abcjs-brace')].map(bounds);
  return {staffs,heads,bridges};
}
