import {canonicalHymnId} from "./hymn-identity";
import hymns from "./hymns.json";
import {hymnArrangements,isGuitarArrangement,type Arrangement} from "./hymn-arrangements";
export type HymnInstrument="guitar"|"piano";
export const hymnInstrumentChoices=[
 {id:"guitar",label:"Guitar",icon:"guitar"},
 {id:"piano",label:"Piano",icon:"keyboard"},
] as const;
export function hymnInstrument(arrangement:Arrangement):HymnInstrument{return isGuitarArrangement(arrangement)?"guitar":"piano";}
export const hymnPrimaryInstrument=hymnInstrument;
export function hymnHasVoice(arrangement:Arrangement){return arrangement === "original" || arrangement === "guitar-vocal";}
export function hymnInstrumentArrangements(hymn:{id:string},instrument:HymnInstrument){return hymnArrangements(hymn).filter(a=>hymnInstrument(a.id)===instrument);}
export function hymnAvailableArrangements(hymn:{id:string}){return hymnArrangements(hymn);}
/** One persisted score ID makes Guitar+Piano states unrepresentable. Old score
 * links retain their meaning; instrument changes preserve the Voice toggle.
 */
export function selectHymnCombination(hymn:{id:string},current:Arrangement,instrument:HymnInstrument,voice=hymnHasVoice(current)){
 const scores=hymnInstrumentArrangements(hymn,instrument);
 return scores.find(a=>hymnHasVoice(a.id)===voice)?.id;
}
export const selectHymnInstrument=selectHymnCombination;
/** Sound follows the score, including the teacher's organ accompaniment. */
export function hymnPlaybackInstrument(hymn:{id:string},arrangement:Arrangement){
 if(isGuitarArrangement(arrangement))return "guitar" as const;
 const entry=hymns.find(h=>h.id===canonicalHymnId(hymn.id));
 return arrangement === "original" && entry && "accompanimentInstrument" in entry && entry.accompanimentInstrument === "organ" ? "organ" as const : "piano" as const;
}
