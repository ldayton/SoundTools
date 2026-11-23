import type { AbsoluteElement, TuneObject, VoiceItem } from "abcjs";
import { fingerstylePosition } from "./fingerstyle-tab";
export type BeginnerInstrument = "piano" | "guitar";
const ns = "http://www.w3.org/2000/svg";
type Note = Extract<VoiceItem, {el_type:"note"}> & {abselem?: AbsoluteElement};
type Entry = {note:Note; bar:number; voice:number; staffIndex:number; pitches:number[]; beat:number};

export {bluesFingers as beginnerFingers} from "./fingerstyle-blues";
import {bluesFingers as beginnerFingers} from "./fingerstyle-blues";

export {bluesLandmarks as beginnerLandmarks} from "./fingerstyle-blues";

/** Break on complete measures, ignoring the opening repeat as a measure. */
export function beginnerSystems(abc: string, measures: number): string {
  const output: string[] = [];
  const lines = abc.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\[V:/.test(lines[i])) { output.push(lines[i]); continue; }
    const voices: string[][] = [];
    while (voices.length < 2 && i < lines.length && /^\[V:/.test(lines[i])) {
      const [, header, music] = lines[i++].match(/^(\[V:[^\]]+\])\s*(.*)$/)!;
      const chunks: string[] = [];
      let current = "", start = 0, count = 0;
      for (const match of music.matchAll(/\|:|:\||\|\]|\|/g)) {
        const content = music.slice(start, match.index);
        current += content + match[0];
        start = match.index! + match[0].length;
        if (!content.replace(/\[P:[^\]]+\]/g, "").trim()) continue;
        if (++count === measures) { chunks.push(`${header} ${current}`); current = ""; count = 0; }
      }
      current += music.slice(start);
      if (current.trim()) chunks.push(`${header} ${current}`);
      voices.push(chunks);
    }
    i--;
    for (let row = 0; row < Math.max(...voices.map(v => v.length)); row++)
      for (const voice of voices) if (voice[row]) output.push(voice[row]);
  }
  return output.join("\n");
}

/** abcjs repeats active part labels on later systems and once per voice. */
export function normalizeBeginnerLandmarks(paper:HTMLElement,tune:TuneObject,from:number,pickup=false) {
  const seen=new Set<string>();
  for(const mark of paper.querySelectorAll('g.abcjs-part')) {
    const label=mark.textContent?.trim() || '';
    if(seen.has(label)) mark.remove();else seen.add(label);
  }
  const music = entries(tune, from).filter(entry => entry.voice === 0);
  for(const svg of paper.querySelectorAll('svg')) {
    const firstNotes = new Map<number, number>();
    for (const entry of music) {
      const absolute = entry.note.abselem;
      const node = absolute?.elemset[0] as SVGGraphicsElement | undefined;
      if (node?.ownerSVGElement !== svg || absolute?.x === undefined) continue;
      firstNotes.set(entry.bar, Math.min(firstNotes.get(entry.bar) ?? Infinity, absolute.x));
    }
    const starts = [...firstNotes].sort((a,b) => a[1]-b[1]);
    const bars=new Set<string>();
    for(const mark of svg.querySelectorAll<SVGGraphicsElement>('.abcjs-bar-number')) {
      const position = bounds(mark, svg);
      const actual = position && starts.find(([, x]) => x >= position.x - 2);
      if (pickup && actual?.[0] === 0) {mark.remove();continue;}
      const key = actual ? String(actual[0] + (pickup ? 0 : 1)) : mark.textContent?.trim() || '';
      if(bars.has(key)) mark.remove();
      else {
        bars.add(key);
        // Derive printed numbering from the music, independent of abcjs's
        // opening-repeat and wrapping counters.
        mark.textContent = key;
        // Two-digit system numbers must clear the tall treble-clef ascender.
        const label = bounds(mark, svg);
        if (label) for (const clef of svg.querySelectorAll<SVGGraphicsElement>('.abcjs-clef')) {
          const ink = bounds(clef, svg);
          if (ink && label.x < ink.x + ink.width && label.x + label.width > ink.x
            && label.y < ink.y + ink.height && label.y + label.height > ink.y) {
            const shift = ink.y - label.y - label.height - 5;
            mark.setAttribute('transform', `translate(0 ${shift})`);
            break;
          }
        }
      }
    }
  }
}

function entries(tune: TuneObject, from: number): Entry[] {
  const states = new Map<number,{bar:number;beat:number;notes:boolean;held:Map<number,number>}>();
  const result: Entry[]=[];
  for (const line of tune.lines) for (const [si,staff] of (line.staff || []).entries()) {
    if (String(staff.clef?.type) === "TAB") continue;
    for (const [vi,voice] of (staff.voices || []).entries()) {
      const id=((staff as typeof staff & {originalStaffIndex?:number}).originalStaffIndex ?? si)+vi;
      const state=states.get(id) || {bar:from,beat:0,notes:false,held:new Map<number,number>()};
      states.set(id,state);
      for (const item of voice) {
        if (item.el_type === 'bar') {
          if (state.notes) {state.bar++;state.beat=0;state.notes=false;}
          continue;
        }
        if(item.el_type !== 'note') continue;
        const attacks=[...(item.midiPitches || [])];
        const pitches=(item.pitches || []).flatMap(p => {
          const midi=p.endTie ? state.held.get(p.pitch) : attacks.shift()?.pitch;
          if(midi===undefined) return [];
          state.held.set(p.pitch,midi);return [midi];
        });
        result.push({note:item,bar:state.bar,voice:id,staffIndex:si,pitches,beat:state.beat});
        state.beat+=item.duration*4;state.notes=true;
      }
    }
  }
  return result;
}
/** Omit the redundant bass-voice rest underneath the shared turnaround chord. */
export function normalizeGuitarRests(tune: TuneObject, from: number) {
  for (const { note, voice, pitches } of entries(tune, from))
    if (voice === 1 && !pitches.length)
      for (const element of note.abselem?.elemset || [])
        (element as unknown as SVGElement).style.visibility = "hidden";
}
function text(parent: SVGElement,x:number,y:number,value:string,className:string,size=10) {
  const node=document.createElementNS(ns,'text');
  node.setAttribute('x',String(x));node.setAttribute('y',String(y));
  node.setAttribute('font-size',String(size));node.setAttribute('font-family','serif');
  node.setAttribute('fill','currentColor');node.setAttribute('paint-order','stroke');
  node.setAttribute('stroke','white');node.setAttribute('stroke-width','2');
  node.classList.add(className);node.textContent=value;parent.append(node);return node;
}
function bounds(element:SVGGraphicsElement,svg:SVGSVGElement) {
  const root=svg.getScreenCTM(),local=element.getScreenCTM();
  if(!root || !local) return undefined;
  const matrix=root.inverse().multiply(local),box=element.getBBox();
  const a=new DOMPoint(box.x,box.y).matrixTransform(matrix);
  const b=new DOMPoint(box.x+box.width,box.y+box.height).matrixTransform(matrix);
  return {x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y};
}
function line(parent:SVGElement,x1:number,y1:number,x2:number,y2:number,cls:string,width=1) {
  const node=document.createElementNS(ns,'line');
  for(const [key,value] of Object.entries({x1,y1,x2,y2})) node.setAttribute(key,String(value));
  node.setAttribute('stroke','currentColor');node.setAttribute('stroke-width',String(width));
  node.classList.add(cls);parent.append(node);return node;
}

/** Add only the starting patterns and changes; repeated finger numbers are omitted. */
export function drawBeginnerFingerings(tune:TuneObject,instrument:BeginnerInstrument,from:number,transpose:number,tabOnly:boolean,fingersFor=beginnerFingers,pickingMarks=true,compactChordFingerings=false) {
  const seen=new Set<string>(),picking=new Map<string,number>();
  for(const {note,bar,voice,staffIndex,pitches} of entries(tune,from)) {
    if(!pitches.length || note.pitches?.every(p=>p.endTie)) continue;
    const absolute=note.abselem as (AbsoluteElement & {cloned?:AbsoluteElement}) | undefined;
    const group=absolute?.elemset[0] as SVGGraphicsElement | undefined;
    const svg=group?.ownerSVGElement;
    if(!group || !svg) continue;
    const heads=[...group.querySelectorAll<SVGGraphicsElement>('.abcjs-notehead')];
    const target=tabOnly ? absolute?.cloned?.elemset?.[0] as SVGGraphicsElement | undefined : group;
    if(!target) continue;
    const targetBox=bounds(target,svg);if(!targetBox) continue;
    const original=pitches.map(p=>p-transpose);
    const fingers=fingersFor(instrument,bar,voice,original);
    const headBoxes=pitches.map((_,i)=>bounds(heads[i] || group,svg));
    const accidentals=[...group.querySelectorAll<SVGGraphicsElement>('.abcjs-accidental,[data-name^="accidentals."]')]
      .flatMap(e=>{const box=bounds(e,svg);return box?[box.x]:[];});
    const fingerX=Math.min(...headBoxes.flatMap(b=>b?[b.x]:[]),...accidentals)-9;
    const fingerY=headBoxes.map(b=>b ? b.y+b.height/2+3 : targetBox.y);
    let above=-Infinity;
    for(let i=fingerY.length-1;i>=0;i--) if(fingers[i]) {
      fingerY[i]=Math.max(fingerY[i],above+10);above=fingerY[i];
    }
    const section=compactChordFingerings && (instrument === "guitar" || voice === 1) ? 0 : bar<8 ? 0 : bar;
    fingers.forEach((finger,index)=>{
      if (tabOnly) return;
      if(!finger) return;
      const key=`${section}:${voice}:${original[index]}:${finger}`;
      if(seen.has(key)) return;seen.add(key);
      const head = heads[index] || group;
      const box = bounds(head, svg); if (!box) return;
      let x = fingerX, y = fingerY[index];
      if (instrument === "piano" && pitches.length === 1) {
        const noteBox = bounds(group, svg)!;
        const staff = [...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-staff")][staffIndex];
        const staffBox = staff && bounds(staff, svg);
        x = box.x + box.width / 2 - 2;
        y = voice === 0 ? Math.min(noteBox.y - 5, (staffBox?.y ?? box.y) - 10)
          : Math.max(box.y + box.height + 12, (staffBox ? staffBox.y + staffBox.height : box.y) + 12);
      }
      if (instrument === "guitar" && pitches.length === 1) {
        // Put single-note fretting numerals opposite their voice stems:
        // below melody heads and above bass heads, clear of accidentals.
        x = box.x + box.width / 2;
        y = voice === 0 ? box.y + box.height + 11 : box.y - 6;
      }
      const mark=text(svg,x,y,String(finger),'beginner-fingering',9);
      if (instrument === "guitar" && pitches.length === 1)
        mark.setAttribute("text-anchor", "middle");
      mark.dataset.instrument=instrument;mark.dataset.voice=String(voice);
      mark.dataset.pitch=String(original[index]);mark.dataset.finger=String(finger);
      mark.setAttribute('aria-label',`${instrument==='piano' ? voice===0?'Right hand':'Left hand' : 'Fretting hand'}: finger ${finger}`);
    });
    if(pickingMarks && instrument==='guitar' && pitches.length === 1) {
      const key=String(voice);
      const count=picking.get(key)||0;picking.set(key,count+1);
      if(count < (voice===0 ? 2 : 1)) {
        const box=bounds(tabOnly ? target : group,svg)!;
        const letter=voice===1 ? 'p' : count===0 ? 'i' : 'm';
        let y=voice===0 ? box.y-7 : box.y+box.height+12;
        if(tabOnly) {
          const staff=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-staff')].sort((a,b)=>a.getBBox().y-b.getBBox().y)[1];
          const tab=staff && bounds(staff,svg);
          if(tab) y=voice===0 ? tab.y-34 : tab.y+tab.height+38;
        }
        const mark=text(svg,box.x+box.width/2,y,letter,'beginner-picking',10);
        mark.setAttribute('text-anchor','middle');
        mark.setAttribute('aria-label',`Picking hand: ${letter==='p'?'thumb':letter==='i'?'index':'middle'} finger`);
        if(voice===0 && count===0 && !tabOnly) {
          const position=fingerstylePosition(pitches[0],false,transpose);
          if(position) {
            const circle=document.createElementNS(ns,'g');circle.classList.add('beginner-string');
            circle.setAttribute('aria-label',`String ${position.str+1}`);
            const ring=document.createElementNS(ns,'circle');
            const x=box.x-12,y=box.y-14;
            ring.setAttribute('cx',String(x));ring.setAttribute('cy',String(y));ring.setAttribute('r','6');
            ring.setAttribute('fill','white');ring.setAttribute('stroke','currentColor');ring.setAttribute('stroke-width','0.8');
            circle.append(ring);
            const number=text(circle,x,y+3,String(position.str+1),'beginner-string-number',9);
            number.setAttribute('text-anchor','middle');number.setAttribute('stroke','none');svg.append(circle);
          }
        }
      }
    }
  }
}

/** Rhythmic tablature: independent melody/bass stems, eighth beams, rests and ties. */
export function drawRhythmicTab(tune:TuneObject,paper:HTMLElement,from:number,transpose:number,positionFor=fingerstylePosition,rhythms=true,bassRests=false) {
  const beam=new Map<number,{x:number;y:number;svg:SVGSVGElement;levels:number}[]>();
  const ties=new Map<string,{x:number;y:number;svg:SVGSVGElement}>();
  for(const {note,voice,pitches} of entries(tune,from)) {
    const absolute=note.abselem as (AbsoluteElement & {cloned?:AbsoluteElement}) | undefined;
    const source=absolute?.elemset[0] as SVGGraphicsElement | undefined;
    const svg=source?.ownerSVGElement;if(!source || !svg) continue;
    const staff=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-staff')].sort((a,b)=>a.getBBox().y-b.getBBox().y)[1];
    if(!staff) continue;
    const box=bounds(staff,svg),sourceBox=bounds(source,svg);if(!box || !sourceBox) continue;
    const top=box.y,bottom=box.y+box.height,step=box.height/5;
    if(rhythms && voice===0 && !svg.querySelector('.tab-rhythm-meter') && svg===paper.querySelector('svg')) {
      const meter=document.createElementNS(ns,'g');meter.classList.add('tab-rhythm-meter');
      text(meter,box.x+38,top+23,String(tune.getMeterFraction().num),'tab-rhythm-time',16);
      text(meter,box.x+38,top+43,String(tune.getMeterFraction().den),'tab-rhythm-time',16);svg.append(meter);
    }
    const up=voice===0,lane=up ? top-25 : bottom+25;
    const tabSource=absolute?.cloned?.elemset?.[0] as SVGGraphicsElement|undefined;
    const tabInk=tabSource?bounds(tabSource,svg):undefined;
    const x=tabInk?tabInk.x+tabInk.width/2:(absolute?.x ?? sourceBox.x)+5;
    if(!pitches.length) {
      if (!rhythms || voice === 1 && !bassRests) continue;
      const rest=source.cloneNode(true) as SVGGraphicsElement;
      rest.querySelectorAll('.beginner-fingering,.beginner-picking').forEach(e=>e.remove());
      const transform=source.getScreenCTM(),root=svg.getScreenCTM();
      if(transform && root) {
        const matrix=root.inverse().multiply(transform);
        const dy=lane-3-(sourceBox.y+sourceBox.height/2);
        rest.setAttribute('transform',`matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e} ${matrix.f+dy})`);
        rest.classList.add('tab-rhythm-rest');svg.append(rest);
      }
      continue;
    }
    const positions=pitches.map(p=>positionFor(p,pitches.length>1,transpose));
    if(positions.some(p=>!p)) continue;
    const ys=positions.map(p=>top+p!.str*step);
    const anchor=up?Math.min(...ys)-5:Math.max(...ys)+5;
    const duration=note.duration;
    const dotted = [0.1875,0.375,0.75].includes(duration);
    const base = dotted ? duration/1.5 : duration;
    const rhythm=document.createElementNS(ns,'g');rhythm.classList.add('tab-rhythm');
    rhythm.dataset.duration=String(duration);rhythm.dataset.voice=String(voice);
    svg.append(rhythm);
    if(rhythms && duration < 1) {
      line(rhythm,x,anchor,x,lane,'tab-rhythm-stem');
      if(base===0.5) line(rhythm,x+3,anchor,x+3,lane,'tab-rhythm-half');
    }
    if (rhythms && dotted) {
      const dot=document.createElementNS(ns,'circle');
      dot.setAttribute('cx',String(x+7));dot.setAttribute('cy',String(lane+(up?2:-2)));
      dot.setAttribute('r','1.6');dot.setAttribute('fill','currentColor');dot.setAttribute('stroke','none');
      dot.classList.add('tab-rhythm-dot');rhythm.append(dot);
    }
    if(rhythms && (base===0.125 || base===0.0625)) {
      const points=beam.get(voice)||[];
      if(note.startBeam || points.length) {
        points.push({x,y:lane,svg,levels:base===0.0625?2:1});beam.set(voice,points);
        if(note.endBeam) {
          for(let i=1;i<points.length;i++) if(points[i].svg===points[i-1].svg) {
            const a=points[i-1],b=points[i],offset=up?5:-5;
            line(svg,a.x,a.y,b.x,b.y,'tab-rhythm-beam',3);
            if(a.levels===2&&b.levels===2)line(svg,a.x,a.y+offset,b.x,b.y+offset,'tab-rhythm-beam-secondary',3);
            else if(a.levels===2)line(svg,a.x,a.y+offset,Math.min(a.x+9,b.x),a.y+offset,'tab-rhythm-beam-secondary',3);
            else if(b.levels===2)line(svg,Math.max(a.x,b.x-9),b.y+offset,b.x,b.y+offset,'tab-rhythm-beam-secondary',3);
          }
          beam.delete(voice);
        }
      } else {
        const flag=document.createElementNS(ns,'path');
        flag.setAttribute('d',`M ${x} ${lane} q 10 ${up?8:-8} 5 ${up?16:-16}`);
        flag.setAttribute('fill','none');flag.setAttribute('stroke','currentColor');flag.setAttribute('stroke-width','2');
        flag.classList.add('tab-rhythm-flag');rhythm.append(flag);
        if(base===0.0625){const second=flag.cloneNode(true) as SVGPathElement;second.setAttribute('transform',`translate(0 ${up?5:-5})`);second.classList.add('tab-rhythm-flag-secondary');rhythm.append(second);}
      }
    }
    (note.pitches || []).forEach((pitch,index)=>{
      const key=`${voice}:${pitch.pitch}`,y=ys[index];
      if(pitch.endTie) {
        // Match attacked fret numbers exactly; a tie, rather than a smaller
        // font, tells the player to sustain this note without plucking again.
        const model = svg.querySelector<SVGTextElement>('.abcjs-tabNumber text') || paper.querySelector<SVGTextElement>('.abcjs-tabNumber text');
        const continuation = model?.cloneNode(false) as SVGTextElement | undefined;
        if (continuation) {
          continuation.textContent = String(positions[index]!.num);
          continuation.setAttribute('x', String(x - 5));
          const modelBox = bounds(model!, model!.ownerSVGElement!)!;
          const baseline = Number(model!.getAttribute('y'));
          const baselineOffset = baseline - modelBox.y - modelBox.height / 2;
          continuation.setAttribute('y', String(y + baselineOffset));
          continuation.classList.add('tab-rhythm-continuation');
          continuation.setAttribute('paint-order', 'stroke');
          continuation.setAttribute('stroke', 'white');
          continuation.setAttribute('stroke-width', '3');
          svg.append(continuation);
        }
        const previous=ties.get(key);
        const path=document.createElementNS(ns,'path');
        const start=previous?.svg===svg ? previous.x+6 : box.x+28;
        path.setAttribute('d',`M ${start} ${y+7} Q ${(start+x-5)/2} ${y+17} ${x-5} ${y+7}`);
        path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');
        path.classList.add('tab-rhythm-tie');rhythm.append(path);
        if(previous && previous.svg!==svg) {
          const end=previous.svg.viewBox.baseVal.width-12;
          const outgoing=document.createElementNS(ns,'path');
          outgoing.setAttribute('d',`M ${previous.x+6} ${previous.y+7} Q ${(previous.x+end)/2} ${previous.y+17} ${end} ${previous.y+7}`);
          outgoing.setAttribute('fill','none');outgoing.setAttribute('stroke','currentColor');
          outgoing.classList.add('tab-rhythm-tie');previous.svg.append(outgoing);
        }
      }
      if(pitch.startTie) ties.set(key,{x,y,svg});else ties.delete(key);
    });
  }
  // Reserve room for both rhythmic voices, including the lowest bass stems.
  for(const svg of paper.querySelectorAll('svg')) {
    const staves=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-staff')].sort((a,b)=>a.getBBox().y-b.getBBox().y);
    if(staves.length!==2) continue;
    const tab=bounds(staves[1],svg);if(!tab) continue;
    const v=svg.viewBox.baseVal;
    const bottom=Math.max(v.y+v.height,tab.y+tab.height+42);
    svg.setAttribute('viewBox',`${v.x} ${v.y} ${v.width} ${bottom-v.y}`);
  }
}

/** Adjacent staff noteheads may stagger; simultaneous tab frets must stay aligned. */
export function alignSimultaneousTab(tune:TuneObject,from:number) {
 const onsets=new Map<string,number>();
 for(const {note,bar,beat,voice} of entries(tune,from)) {
  const absolute=note.abselem as (AbsoluteElement & {cloned?:AbsoluteElement})|undefined;
  const number=absolute?.cloned?.elemset?.[0] as SVGGraphicsElement|undefined;
  const svg=number?.ownerSVGElement;if(!number||!svg)continue;
  const box=bounds(number,svg);if(!box)continue;
  const key=`${bar}:${beat}`,center=box.x+box.width/2;
  if(voice===0)onsets.set(key,center);
  else if(onsets.has(key))number.setAttribute('transform',`translate(${onsets.get(key)!-center} 0)`);
 }
}

/** Keep opposing voices' fingering numbers distinct beside nearby noteheads. */
export function separateGuitarFingerings(paper:HTMLElement) {
 for(const svg of paper.querySelectorAll('svg')) {
  const melody=[...svg.querySelectorAll<SVGGraphicsElement>('.abcjs-v0 .beginner-fingering')];
  for(const bass of svg.querySelectorAll<SVGTextElement>('.abcjs-v1 .beginner-fingering')){
   const a=bounds(bass,svg);if(!a)continue;
   if(melody.some(mark=>{const b=bounds(mark,svg);return b&&a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}))bass.setAttribute('x',String(Number(bass.getAttribute('x'))-7));
  }
 }
}
