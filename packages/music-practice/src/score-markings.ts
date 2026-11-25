import type {TuneObject, VoiceItem} from "abcjs";

type SectionItem = VoiceItem & {scoreSectionStart?: boolean;barNumber?: number};
export const isScoreSectionStart = (item: VoiceItem) => (item as SectionItem).scoreSectionStart === true;

/** Presentation policy shared by layout measurement and final engraving.
 * Retain musical tempo and section boundaries without printing editorial labels. */
export function prepareScoreMarkings(tune: TuneObject, barNumbers = false) {
  if(tune.metaText.tempo) (tune.metaText.tempo as typeof tune.metaText.tempo & {suppress?:boolean}).suppress=true;
  for(const line of tune.lines)for(const staff of line.staff || []){
    if(!barNumbers){
      delete (staff as typeof staff & {barNumber?:number}).barNumber;
      if(staff.clef)delete (staff.clef as typeof staff.clef & {barNumber?:number}).barNumber;
    }
    staff.voices=staff.voices?.map(voice=>{
      let section=false;
      return voice.filter(item=>{
        if(item.el_type==="part"){section=true;return false;}
        if(!barNumbers)delete (item as SectionItem).barNumber;
        if(item.el_type==="note"){
          if(section)(item as SectionItem).scoreSectionStart=true;
          section=false;
          item.chord=item.chord?.filter((c:{position?:string;name:string})=>c.position==="default" || c.name.trim()!=="Let ring");
        }
        return true;
      });
    });
  }
}

export const SWING_HELP = "Play each pair of eighth notes long–short rather than evenly. Keep the beat steady; playback uses the same swing feel.";
let tooltipId=0;
/** A single accessible feel indication works in notation, tab and chord views. */
export function addSwingHelp(paper: HTMLElement) {
  const wrap=document.createElement("div");wrap.className="score-swing";
  const button=document.createElement("button");button.type="button";button.className="score-swing-trigger";button.textContent="Swing";
  const help=document.createElement("span");help.className="score-swing-help";help.id=`score-swing-help-${++tooltipId}`;help.role="tooltip";help.textContent=SWING_HELP;help.hidden=true;
  button.setAttribute("aria-describedby",help.id);button.setAttribute("aria-expanded","false");
  let pinned=false;
  const show=(visible:boolean)=>{help.hidden=!visible;button.setAttribute("aria-expanded",String(visible));};
  wrap.addEventListener("mouseenter",()=>show(true));
  wrap.addEventListener("mouseleave",()=>{if(!pinned)show(false);});
  button.addEventListener("focus",()=>show(true));
  button.addEventListener("blur",()=>{pinned=false;show(false);});
  button.addEventListener("click",()=>{pinned=!pinned;show(pinned);});
  button.addEventListener("keydown",event=>{if(event.key==="Escape"){pinned=false;show(false);}});
  wrap.append(button,help);paper.prepend(wrap);
}
