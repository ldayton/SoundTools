export {compareLayoutPixels,layoutComparatorSamples} from "./score-layout-images";
/** Independent engraving fixtures; intentionally unrelated to product songs. */
import {AbcScoreLayout} from "../src/score-layout/abc";
import {prepareScoreMarkings} from "../src/score-markings";

let lastTune:ReturnType<AbcScoreLayout["render"]>|undefined;
const melody='"C"C D E F | "G"G A B c | "Am"c B A G | "F"F E D C | "C"C2 E2 | "G"G2 B2 | "F"A G F E | "C"C4 |]';
const english='one two three four five six sev en eight nine ten now sing this tune well hold this note here end this phrase now rest';
const hebrew='מַה טּוֹב לָנוּ שִׁיר חָדָשׁ בַּלֵּב אוֹר בָּא כָּאן עוֹד שִׁיר נָעִים לִי הַיּוֹם טוֹב לָנוּ אוֹר לָנוּ שִׁיר עוֹד כָּאן לֵב שָׁלוֹם';
export type LayoutFixtureKind = "piano"|"guitar"|"hebrew"|"dense"|"hidden-ink"|"clipped-ink"|"partial"|"verses"|"sparse";
export type LayoutFixtureOptions = { reverseVerses?:boolean; cold?:boolean };
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
  if(kind==="sparse") source='X:1\nM:4/4\nL:1/4\nK:C\nC4 | G4 | C4 |]';
  let host=document.getElementById('layout-fixture-host');
  if(!host) {host=document.createElement('div');host.id='layout-fixture-host';document.body.append(host);}
  host.style.width=`${width}px`;
  let paper=document.getElementById('layout-fixture')!;
  if(!paper) {paper=document.createElement('div');paper.id='layout-fixture';host.append(paper);}
  const layout=new AbcScoreLayout({source:kind==="partial"?source.replace(/\|\]\nw:/,"\nw:"):source,width,scale,mode:"reflow",params:{add_classes:true,
    tablature:kind==="guitar"?[{instrument:"guitar"}]:undefined,
    afterParsing:tune=>{prepareScoreMarkings(tune,false);return tune;},
  },measurementContext:options.cold?undefined:[kind,options.reverseVerses]});
  const tune=layout.render(paper);
  lastTune=tune;
  const frames=[...paper.querySelectorAll('svg')].map(svg=>{
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
  return {plan:layout.plan,frames,geometry,noteXs,lyrics:paper.querySelectorAll('.abcjs-lyric').length,
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
    const timed=(lastTune?.lines.flatMap(line=>line.staff?.[0]?.voices?.[0]||[])||[])
      .flatMap(item=>{
        if(item.el_type!=="note")return [];
        const element=(item as typeof item & {abselem?:{elemset:SVGGraphicsElement[]}}).abselem?.elemset[0];
        return element?.ownerSVGElement===svg?[{duration:item.duration,x:element.getBoundingClientRect().left}]:[];
      });
    const rhythmicGaps=timed.slice(1).map((note,i)=>(note.x-timed[i].x)/staffSpace/Math.sqrt(Math.max(.0625,timed[i].duration)/.25));
    const words=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-lyric')].map(node=>node.getBoundingClientRect());
    const lyricCollisions=words.flatMap((a,i)=>words.slice(i+1).filter(b=>Math.abs(a.top-b.top)<staffSpace/2&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>1));
    const lyricCrowding=words.filter(a=>words.some(b=>b.left>a.left&&Math.abs(a.top-b.top)<staffSpace/2&&(b.left-a.right)/staffSpace<.25)).length;
    const ink=[...svg.querySelectorAll<SVGGraphicsElement>('path,text,line,rect')]
      .filter(node=>!node.closest('defs')&&getComputedStyle(node).visibility!=='hidden')
      .map(node=>node.getBoundingClientRect()).filter(rect=>rect.width||rect.height);
    const top=ink.length?Math.min(...ink.map(rect=>rect.top)):box.top;
    const bottom=ink.length?Math.max(...ink.map(rect=>rect.bottom)):box.bottom;
    return {height:box.height/staffSpace,topBlank:(top-box.top)/staffSpace,bottomBlank:(box.bottom-bottom)/staffSpace,
      maxNoteGap:gaps.length?Math.max(...gaps):0,maxRhythmicGap:rhythmicGaps.length?Math.max(...rhythmicGaps):0,lyricCollisions:lyricCollisions.length,lyricCrowding,
      overflows:ink.filter(rect=>rect.left<box.left-1||rect.right>box.right+1||rect.top<box.top-1||rect.bottom>box.bottom+1).length};
  });
  return {staffSpace,viewportOverflow:Math.max(0,paper.scrollWidth-paper.clientWidth)/staffSpace,scrollHeight:paper.scrollHeight/staffSpace,systems};
}
