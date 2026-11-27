import {CAGED_SHAPES, patternBounds, patternPositions, patternShift, type ScaleShape} from './guitar-scale-patterns';
import {isMaqam} from './maqamat';
import {scaleNotes, type ScaleQuality} from './guitar-scales';
import {positionKey, type ShiftNote} from './scale-shift';

export type CagedRegion = {shape:ScaleShape; shift:number; notes:ShiftNote[]};
export type CagedRouteNote = ShiftNote & {region:number};
export type CagedRoute = {regions:CagedRegion[]; notes:CagedRouteNote[]; shifts:{previous:CagedRouteNote;arrival:CagedRouteNote}[]};

/** One root-to-root scale through five neighbouring positions. The search owns
 * both the diagram and its shift instructions; it never changes a scale pitch
 * or invents fingers outside the reviewed position charts. */
export function cagedRoute(tonic:number,quality:ScaleQuality,spelling?:string):CagedRoute|undefined {
  if(isMaqam(quality))return;
  const regions=CAGED_SHAPES.map(shape=>{
    const shift=patternShift(tonic,quality,shape);
    return {shape,shift,notes:patternPositions(tonic,quality,shape,shift,spelling)};
  }).sort((a,b)=>patternBounds(a.shape,quality)[0]+a.shift-patternBounds(b.shape,quality)[0]-b.shift);
  const classes=scaleNotes(tonic,quality,spelling).map(n=>n.pitchClass);
  const next=(midi:number)=>{
    for(let step=1;step<=3;step++)if(classes.includes((midi+step)%12))return midi+step;
    throw Error('Unsupported scale interval');
  };
  const starts=regions[0].notes.filter(n=>n.root).sort((a,b)=>a.midi-b.midi);
  const finish=Math.max(...regions.at(-1)!.notes.filter(n=>n.root).map(n=>n.midi));
  type Result={cost:number;notes:CagedRouteNote[]};
  const cache=new Map<string,Result|undefined>();
  function visit(note:CagedRouteNote,count:number):Result|undefined {
    if(note.region===4&&note.midi===finish)return count>=2?{cost:0,notes:[note]}:undefined;
    if(note.midi>=finish)return;
    const key=`${note.region}:${positionKey(note)}:${Math.min(2,count)}`;
    if(cache.has(key))return cache.get(key);
    let best:Result|undefined;
    for(const region of [note.region,...(count>=2&&note.region<4?[note.region+1]:[])]){
      for(const candidate of regions[region].notes){
        if(candidate.midi!==next(note.midi))continue;
        const shift=region!==note.region;
        // Scale travel crosses at most one string; hand shifts happen on one
        // string and move toward higher frets by one scale step, never a leap.
        if(shift ? candidate.string!==note.string||candidate.fret<=note.fret||candidate.fret-note.fret>3
          : candidate.string>note.string||note.string-candidate.string>1)continue;
        const tail=visit({...candidate,region},shift?1:count+1);if(!tail)continue;
        const cost=tail.cost+Math.abs(candidate.fret-note.fret)+(shift?Math.abs(candidate.finger-note.finger)*.25:0);
        if(!best||cost<best.cost)best={cost,notes:[note,...tail.notes]};
      }
    }
    cache.set(key,best);return best;
  }
  for(const start of starts){
    const result=visit({...start,region:0},1);if(!result)continue;
    const notes=result.notes;
    return {regions,notes,shifts:notes.flatMap((arrival,i)=>i&&arrival.region!==notes[i-1].region?[{previous:notes[i-1],arrival}]:[])};
  }
}

export function reverseCagedRoute(route:CagedRoute):CagedRoute {
  const notes=[...route.notes].reverse();
  return {...route,notes,shifts:notes.flatMap((arrival,i)=>i&&arrival.region!==notes[i-1].region?[{previous:notes[i-1],arrival}]:[])};
}
