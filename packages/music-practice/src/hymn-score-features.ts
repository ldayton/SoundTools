import {sourceStaffIndex} from './hymn-playback-staves';
import {isGuitarArrangement,type Arrangement} from './hymn-arrangements';
import {hymnHasVoice} from './hymn-instruments';
import type {TuneObject} from 'abcjs';

/** Display capabilities belong to the played instrument, independently of Voice. */
export function hymnScoreFeatures(arrangement:Arrangement,display:'notation'|'tab'|'both'|'chords'='both') {
  const guitar=isGuitarArrangement(arrangement),voice=hymnHasVoice(arrangement);
  const fingerings=!(guitar&&display==='chords');
  return {guitar,voice,tablature:guitar,fingerings,guitarStaff:voice?1:0,
    fingeringReason:fingerings?undefined:'Turn on notation or tablature to show note fingerings.'};
}
/** Stable source indexes survive hidden staves and generated TAB staves. */
export function instrumentStaffIndexes(tune:TuneObject,voice:boolean) {
  return (tune.lines.find(line=>line.staff?.length)?.staff||[]).flatMap((staff,index)=>
    String(staff.clef?.type)==='TAB'||voice&&sourceStaffIndex(staff,index)===0?[]:[sourceStaffIndex(staff,index)]);
}
