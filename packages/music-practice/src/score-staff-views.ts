import {anchorScoreInk} from './score-layout/vertical';
import type {TuneObject,AbsoluteElement} from 'abcjs';
import {sourceStaffIndex} from './hymn-playback-staves';

/** Keep generated TAB attached to its source staff after visibility reindexing. */
export function prepareStaffTab(tune:TuneObject) {
  type Plugin={params:object;instance:{render():void}|null};
  const value=tune as TuneObject&{tablatures?:Plugin[]};
  if(!value.tablatures)return;
  const plugins=[...value.tablatures];
  const staves=tune.lines.find(line=>line.staff?.length)?.staff||[];
  value.tablatures=staves.map((staff,index)=>plugins[sourceStaffIndex(staff,index)]);
  for(let index=0;index<value.tablatures.length;index++)
    if(!value.tablatures[index])value.tablatures[index]={params:{},instance:{render(){}}};
}
/** Project only the guitar notation. Voice and its lyrics retain their own staff. */
export function projectInstrumentNotation(tune:TuneObject,paper:HTMLElement,staffIndex:number,tab:boolean) {
  for(const line of tune.lines){
    const staves=line.staff||[];
    const index=staves.findIndex((staff,i)=>String(staff.clef?.type)!=='TAB'&&sourceStaffIndex(staff,i)===staffIndex);
    if(index<0)continue;
    const staff=staves[index],voices=staff.voices||[];
    const elements=voices.flatMap(voice=>voice.flatMap(item=>((item as typeof item&{abselem?:AbsoluteElement}).abselem?.elemset||[]))) as SVGGraphicsElement[];
    const source=elements.find(element=>element.ownerSVGElement),svg=source?.ownerSVGElement;
    if(!svg||!paper.contains(svg))continue;
    const staffInk=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-staff')].sort((a,b)=>a.getBBox().y-b.getBBox().y);
    staffInk[index]?.style.setProperty('visibility','hidden');
    const firstVoice=staves.slice(0,index).reduce((sum,s)=>sum+(s.voices?.length||0),0);
    for(let voice=firstVoice;voice<firstVoice+voices.length;voice++)
      svg.querySelectorAll<SVGElement>(`.abcjs-staff-extra.abcjs-v${voice},.abcjs-beam.abcjs-v${voice},.abcjs-slur.abcjs-v${voice}`).forEach(n=>n.style.visibility='hidden');
    // Native ownership includes beams, dynamics and clefs outside note groups.
    // Hide the complete source staff before shared vertical placement compacts it.
    type NativeVoice={staff:object;children?:{elemset?:SVGElement[]}[];otherchildren?:{elemset?:SVGElement[]}[]};
    const nativeGroups=tune.engraver?.staffgroups as {staffs:object[];voices:NativeVoice[]}[]|undefined;
    for(const native of nativeGroups||[]){
      const related=native.voices.some(v=>v.children?.some(c=>c.elemset?.some(e=>svg.contains(e))));
      if(!related)continue;
      for(const voice of native.voices.filter(v=>v.staff===native.staffs[index]))
        for(const child of [...(voice.children??[]),...(voice.otherchildren??[])])
          for(const node of child.elemset||[])node.style.visibility='hidden';
    }
    for(const element of elements){
      // Chord buttons belong to the accompaniment even when its notation is hidden.
      for(const chord of element.querySelectorAll<SVGGraphicsElement>('.abcjs-chord')){
        const copy=chord;
        copy.classList.add('instrument-view-chord');copy.style.visibility='visible';svg.append(copy);
        if(tab){const target=staffInk.at(-1);if(target){const box=target.getBBox(),ink=copy.getBBox();copy.setAttribute('transform',`translate(0 ${box.y-25-ink.y-ink.height})`);}}
        // Give the chord the same ownership as the generated instrument staff.
        const target=tab?staffInk.at(-1):staffInk[0];if(target)anchorScoreInk(copy,target);
      }
      element.style.visibility='hidden';
    }
  }
}
