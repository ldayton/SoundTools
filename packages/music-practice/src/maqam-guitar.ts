import { scalePositions } from './guitar-scales';
import type { MaqamQuality } from './maqamat';
/** Five-fret positions cover every intervening scale pitch across string changes.
 * Most rows use one finger per fret. A five-fret row compresses one whole-tone
 * gap into adjacent fingers, the usual 1-2-4/1-3-4 extension, not a finger slide.
 */
export function maqamPositions(tonic:number, quality:MaqamQuality, firstFret:number, spelling?:string){
  if(!Number.isInteger(firstFret)||firstFret<1||firstFret>14)throw Error('Invalid maqam hand position');
  const notes=scalePositions(tonic,quality,spelling,firstFret,firstFret+4);
  return notes.map(note=>{
    const row=notes.filter(n=>n.string===note.string);
    const low=row[0].fret, high=row.at(-1)!.fret;
    const anchor=Math.max(firstFret,high-3);
    if(high-low<4)return {...note,finger:note.fret-anchor+1};
    const gap=row.find((n,i)=>i>0&&n.fret-row[i-1].fret>1);
    if(!gap)throw Error('Maqam fingering needs a reviewed extension');
    return {...note,finger:note.fret-low+1-(note.fret>=gap.fret?1:0)};
  });
}
