import {useSyncExternalStore} from "react";
import {Button,Group} from "@mantine/core";
import {ControlIcon} from "@ldayton/ui/control-icon";
import {hymnPrimaryInstrument,hymnHasVoice,selectHymnCombination,hymnInstrumentChoices} from "./hymn-instruments";
import type {HymnOptionsState,HymnOptionsChange} from "./hymn-options-state";
export function HymnInstrumentSelector({model,change}:{model:HymnOptionsState;change(patch:HymnOptionsChange):void}){
 const state=useSyncExternalStore(model.subscribe,model.getSnapshot),instrument=hymnPrimaryInstrument(state.arrangement),voice=hymnHasVoice(state.arrangement),hymn={id:state.hymn};
 const choose=(next:ReturnType<typeof selectHymnCombination>)=>{if(next&&next!==state.arrangement)change({arrangement:next});};
 const instruments=hymnInstrumentChoices;
 const vocalScore=selectHymnCombination(hymn,state.arrangement,instrument,!voice);
 return <Group className="hymn-toolbar-instruments" role="group" aria-label="Instruments and voice" gap={0} wrap="nowrap">
  <Group role="radiogroup" aria-label="Instrument" gap={0} wrap="nowrap">
   {instruments.map(item=>{
    const next=selectHymnCombination(hymn,state.arrangement,item.id),selected=instrument===item.id;
    return <Button key={item.id} role="radio" type="button" aria-label={item.label} aria-checked={selected} data-instrument={item.id} data-arrangement={state.arrangement} disabled={!next} tabIndex={selected?0:-1} variant={selected?"light":"default"} title={next?item.label:`${item.label}${voice?" + Voice":""} is not available for this song`} px={0}
     onClick={()=>choose(next)} onKeyDown={event=>{
      if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(event.key))return;event.preventDefault();
      const target=event.key==="Home"?"guitar":event.key==="End"?"piano":item.id==="guitar"?"piano":"guitar";
      const score=selectHymnCombination(hymn,state.arrangement,target);if(!score)return;choose(score);
      event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-instrument="${target}"]`)?.focus();
     }}><ControlIcon name={item.icon}/></Button>;
   })}
  </Group>
  <Button type="button" aria-label="Voice" aria-pressed={voice} data-instrument="sung" data-arrangement={state.arrangement} disabled={!vocalScore} title={vocalScore?"Voice":"Voice is not available for this song"} variant={voice?"light":"default"} px={0} onClick={()=>choose(vocalScore)}><ControlIcon name="vocal-microphone"/></Button>
 </Group>;
}
