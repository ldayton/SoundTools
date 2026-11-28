import {recommendHymnGuitarCapos} from "../src/hymn-guitar-capos";
import {hasSwing,swingAudio} from '../src/hymn-swing';
import type {AudioTracks} from 'abcjs';
import abcjs from 'abcjs';
import hymns from '../src/hymns.json';
import {arrangeHymn,isInstrumentArrangement,hymnArrangements,type Arrangement} from '../src/hymn-arrangements';
import {chordEdition,instrumentEditionIds} from '../src/instrument-editions';
import {hymnScoreFeatures} from '../src/hymn-score-features';
import {capoPosition} from '../src/guitar-capo';
import {usesChristPicking} from '../src/christ-picked-accompaniment';
import {drawPracticeScore} from '../src/practice-score';
import {visibleScoreInk,scoreInkBox} from '../src/score-layout/geometry';
export const editions=instrumentEditionIds;
export const combinations=(id:string)=>hymnArrangements(hymns.find(h=>h.id===id)!).map(a=>a.id);
export function renderInstrumentFeatures(id:string,arrangement:Arrangement,display:'both'|'notation'|'tab'='both',hideVoice=false,width=700){
 const hymn=hymns.find(h=>h.id===id)!,profile=chordEdition(hymn),features=hymnScoreFeatures(arrangement);
 const voice=features.voice,guitar=features.guitar;
 const choice=profile&&guitar?recommendHymnGuitarCapos(hymn,{voice})[0]:undefined;
 const capo=choice?.fret??profile?.capo??0,shift=(profile?.capo??0)-capo;
 const picked=voice&&usesChristPicking(profile?.editionKey,0,capo);
 const score=arrangeHymn(hymn,arrangement,2,0,'both',undefined,0,choice);
 const positionFor=profile?(pitch:number,chord:boolean,_transpose=0,group?:readonly number[])=>choice&&!choice.scoreSetting&&!picked?capoPosition(choice,pitch,chord,shift,group):profile.position(pitch,chord,0):undefined;
 let host=document.getElementById('feature-host');if(!host){host=document.createElement('div');host.id='feature-host';document.body.append(host);}
 host.style.width=`${width}px`;host.replaceChildren();
 const sourceMusic=(abc:string)=>swingAudio(abcjs.parseOnly(abc)[0].setUpAudio({qpm:60,chordsOff:true,midiTranspose:guitar&&!voice?-12:0}),hasSwing(abc)).tracks.map(track=>track.flatMap(n=>n.cmd==='note'?[[n.pitch+(guitar&&!voice?profile?.capo||0:0),n.start,n.duration]]:[]));
 let audio:AudioTracks|undefined;
 const viewOptions={fitHymnSystems:true,fingerings:true,beginnerEdition:isInstrumentArrangement(hymn,arrangement)?guitar?'guitar' as const:'piano' as const:undefined,
   hymnEdition:profile?.id,guitarSetup:profile&&guitar?{capo,key:hymn.key}:undefined,capoChoice:choice,
   guitarTab:guitar&&display!=='notation',fingerstyleTab:guitar,tabOnly:guitar&&display==='tab',guitarNotation:display!=='tab',guitarMidiOffset:guitar&&!voice?-12:0,
   guitarStaffIndex:guitar&&voice?1:undefined,guitarAccompaniment:guitar&&voice&&positionFor?{capo,positionFor}:undefined,
   pianoStaffIndexes:voice&&!guitar?[1,2]:undefined,generatedPianoFingerings:voice&&!guitar,printedScore:voice,transpose:guitar&&!voice?shift:0,
   hiddenStaves:hideVoice?[0]:[],playback:(value:AudioTracks)=>{audio=value;}};
 const events=drawPracticeScore(host,score.abc,width,viewOptions);
 const marks=[...host.querySelectorAll<SVGGraphicsElement>('.beginner-fingering,.hymn-fingering')].filter(n=>visibleScoreInk(n)).map(n=>({staff:n.dataset.staff,note:n.dataset.noteId,instrument:n.dataset.instrument,finger:Number(n.dataset.finger),string:Number(n.dataset.string),fret:Number(n.dataset.fret)}));
 const tabs=[...host.querySelectorAll<SVGGraphicsElement>('.abcjs-tab-number')].filter(visibleScoreInk).map(n=>n.textContent);
 const clipped=[...host.querySelectorAll<SVGSVGElement>('svg')].flatMap(svg=>[...svg.querySelectorAll<SVGGraphicsElement>('.beginner-fingering,.hymn-fingering,.abcjs-tab-number')].flatMap(n=>{const ink=scoreInkBox(n,svg),v=svg.viewBox.baseVal;return ink&&(ink.left<v.x-1||ink.right>v.x+v.width+1||ink.top<v.y-1||ink.bottom>v.y+v.height+1)?[n.outerHTML]:[];}));
 // Display projection must preserve the complete, independent source voices.
 const music=sourceMusic(score.abc);
 return {id,arrangement,capo,marks,tabs,clipped,misplacedLyrics:[...host.querySelectorAll<SVGGraphicsElement>(".abcjs-lyric")].filter(n=>visibleScoreInk(n)&&n.closest(".abcjs-v1")).map(n=>n.textContent),rhythms:host.querySelectorAll(".tab-rhythm,.tab-rhythm-rest").length,voiceTimingAnchors:events.flatMap(e=>e.elements?.flat()||[]).filter(e=>e?.classList.contains("abcjs-v0")&&!e.classList.contains("abcjs-tabNumber")).length,tracks:audio?.tracks.length,music,renderMusic:audio?.tracks.map(track=>track.flatMap(n=>n.cmd==='note'?[[n.pitch,n.start,n.duration]]:[])),staffs:host.querySelectorAll('.abcjs-staff').length,hasProfile:!!profile,vertical:[...host.querySelectorAll<SVGSVGElement>("svg")].map(svg=>({status:svg.dataset.scoreVertical,reason:svg.dataset.scoreVerticalReason}))};
}

/** An independent multi-system boundary witness: no song-specific expectations. */
export function renderWrappedAccompaniment(){
 let host=document.getElementById('feature-host');if(!host){host=document.createElement('div');host.id='feature-host';document.body.append(host);}host.style.width='260px';host.replaceChildren();
 const abc='X:1\nM:4/4\nL:1/4\n%%score Voice | Guitar\nV:Voice clef=treble name="Voice"\nV:Guitar clef=treble transpose=-12 name="Guitar"\nK:C\n[V:Voice] C D E F | G A B c | c B A G | F E D C |]\nw: one two three four five six seven eight nine ten now sing this tune well end\n[V:Guitar] "C"[CEG]4 | "F"[CFA]4 | "G"[DGB]4 | "C"[CEG]4 |]';
 const positionFor=(pitch:number)=>({48:{str:4,num:3},50:{str:3,num:0},52:{str:3,num:2},53:{str:3,num:3},55:{str:2,num:0},57:{str:2,num:2},59:{str:1,num:0}} as Record<number,{str:number;num:number}>)[pitch];
 drawPracticeScore(host,abc,260,{fitHymnSystems:true,printedScore:true,guitarTab:true,fingerstyleTab:true,guitarMidiOffset:0,guitarStaffIndex:1,guitarAccompaniment:{capo:0,positionFor}});
 return {systems:host.querySelectorAll('svg').length,notes:host.querySelectorAll('.abcjs-note:not(.abcjs-tabNumber)').length,
  misplacedLyrics:[...host.querySelectorAll<SVGGraphicsElement>('.abcjs-lyric')].filter(n=>n.closest('.abcjs-v1')).map(n=>n.textContent)};
}
