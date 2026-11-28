import type {HymnRangeChoices} from './hymn-range';
import type {HymnKey} from './hymn-transpose';
import {arrangeHymn,guitarVocalAccompaniment,type Hymn} from './hymn-arrangements';
import {chordEdition} from './instrument-editions';
import {usesChristPicking} from './christ-picked-accompaniment';
import {recommendGuitarCapos} from './guitar-capo';

/** One performance source for rendering, range eligibility and capo advice. */
export function recommendHymnGuitarCapos(hymn:Hymn,{voice=false,transpose=0,bpm,requestedCapo=null}:{voice?:boolean;transpose?:number;bpm?:number;requestedCapo?:number|null}={}){
 const profile=chordEdition(hymn);if(!profile)return [];
 const accompanimentAbc=voice?guitarVocalAccompaniment(hymn,0,0,undefined,false).abc:arrangeHymn(hymn,'guitar-edition',0,0,'left').abc;
 return recommendGuitarCapos({
  abc:voice?accompanimentAbc:arrangeHymn(hymn,'guitar-edition',0).abc,
  accompanimentAbc,
  sourceCapo:profile.capo,transpose,shapeKey:profile.guitarKey||hymn.key,positionFor:profile.position,requestedCapo,accompanimentOnly:voice,bpm:bpm??profile.tempo,
  referencePerformanceAbc:voice&&usesChristPicking(profile.editionKey,transpose,profile.capo+transpose)?guitarVocalAccompaniment(hymn,0).abc:undefined,
 });
}

/** Resolve the active register with physical evidence, checking other keys only
 * when the current/preferred key cannot fit. Menu previews stay inexpensive. */
export function playableGuitarRange(
 input:HymnRangeChoices,
 current:HymnKey,octave:number|undefined,preferDefault:boolean,
 playable:(key:HymnKey,octave:number)=>boolean,
):HymnRangeChoices{
 const choices=input.choices.map(choice=>({...choice,octaves:[...choice.octaves]}));
 const priority=[preferDefault?input.preferred:current,input.preferred,...choices.filter(c=>c.fits).sort((a,b)=>a.semitones-b.semitones).map(c=>c.key)];
 for(const key of new Set(priority)){
  const candidate=choices.find(c=>c.key===key);if(!candidate?.fits)continue;
  const base=candidate.semitones-(candidate.octave??0)*12;
  candidate.octaves=candidate.octaves.filter(o=>playable(candidate.key,o));
  candidate.fits=candidate.octaves.length>0;
  candidate.octave=candidate.key===current&&candidate.octaves.includes(octave??0)?octave??0:
    candidate.octaves.includes(0)?0:candidate.octaves[0];
  if(candidate.fits){candidate.semitones=base+candidate.octave! * 12;return {choices,preferred:candidate.key};}
 }
 return {choices,preferred:undefined};
}
