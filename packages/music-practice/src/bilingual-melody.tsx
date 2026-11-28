import {useLayoutEffect,useRef,useState} from "react";
import {AbcScoreLayout,prepareScoreLayoutSource} from "./score-layout/abc";
import {initialHymnSignatures} from "./hymn-signatures";
/** A reading adapter over the shared engraver. Translation stays ordinary
 * phrase text; only the sung language is syllabically underlaid in the ABC. */
export function BilingualMelody({abc,size,opening=true,repeatKey=false}:{abc:string;size:number;opening?:boolean;repeatKey?:boolean}) {
  const host=useRef<HTMLDivElement>(null),[width,setWidth]=useState(0);
  useLayoutEffect(()=>{
    const element=host.current!;
    const observer=new ResizeObserver(()=>setWidth(element.clientWidth));observer.observe(element);setWidth(element.clientWidth);
    return ()=>observer.disconnect();
  },[]);
  useLayoutEffect(()=>{
    const element=host.current;if(!element||!width)return;
    const source=prepareScoreLayoutSource(abc.replace(/^T:.*\n/gm,""),{staffScale:size/22}).replace(/^%%barnumbers 1$/m,"%%barnumbers 0");
    const layout=new AbcScoreLayout({source,width,scale:size/22,mode:"reflow",presentation:{lyrics:true},measurementContext:[opening,repeatKey,size],params:{
      add_classes:true,staffwidth:width,afterParsing:tune=>{
        initialHymnSignatures(tune);
        if(!opening){const staff=tune.lines.find(l=>l.staff)?.staff?.[0];if(staff){if(staff.clef)staff.clef={...staff.clef,type:"none"};if(!repeatKey&&staff.key)staff.key={...staff.key,accidentals:[]};}}
        return tune;
      },
    }});
    const tune=layout.render(element);
    if(tune.warnings?.length)throw Error(tune.warnings.join("\n"));
    for(const svg of element.querySelectorAll<SVGSVGElement>("svg"))layout.fit(svg);
    layout.finish();
  },[abc,width,size,opening,repeatKey]);
  return <div ref={host} className="bilingual-melody" aria-label="Sung melody" />;
}
