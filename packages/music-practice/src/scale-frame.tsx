import { attachDirectionalSwipe } from "@ldayton/browser-controls/directional-swipe";
import type {CagedRouteDirection} from "./caged-route";
import type { cagedChordDiagram } from "./guitar-scale-patterns";
import { GuitarChordGraphic } from "./guitar-chord-diagram";
import { useMediaQuery } from "@mantine/hooks";
import { useSyncExternalStore, useState, useRef, useEffect, type ReactNode } from "react";
import { ActionIcon, Button, Kbd, Modal, NativeSelect, Table, Text, Title, Tooltip } from "@mantine/core";
import { frameState } from "./practice-frame";
export const scaleBodyState = () =>
  frameState({
    title: "",
    caption: "",
    shortcutsOpen: false,
    shiftMode: false,
    shiftSelected: false,
    canReverse: false,
    shiftMessage: "",
    linkedLegend: "",
    chordAvailable: false,
    chordOpen: false,
    blueNoteLabel: "",
    omittedNoteLabel: "",
    chordDiagrams: [] as ReturnType<typeof cagedChordDiagram>[],
    reversedColors: false,
    linkHelp: "",
    movable: false,
    maqamReference: "",
    wholeRoute: false,
    routeDirection: 'both' as CagedRouteDirection,
    routeVariant:0,
    routeChoices:[] as {value:string;label:string}[],
  });
export function ScaleFrame({
  body,
  relative,
  navigation,
  clearShift,
  reverseLink,
  setChordOpen,
  navigate,
  setRouteDirection,
  setRouteVariant,
}: {
  body: ReturnType<typeof scaleBodyState>;
  relative: ReactNode;
  navigation: ReactNode;
  clearShift(): void;
  reverseLink(): void;
  setChordOpen(open: boolean): void;
  navigate(axis: "tonic" | "shape", direction: number): void;
  setRouteDirection(direction:CagedRouteDirection):void;
  setRouteVariant(variant:number):void;
}) {
  const s = useSyncExternalStore(body.subscribe, body.getSnapshot);
  const [horizontal,setHorizontal]=useState(true);
  const [chordFrame,setChordFrame]=useState(0);
  const surface = useRef<HTMLElement>(null);
  const chordTrigger=useRef<HTMLButtonElement>(null);
  const activeChord=s.chordDiagrams[Math.min(chordFrame,s.chordDiagrams.length-1)];
  const hoverable = useMediaQuery("(min-width: 48em) and (hover: hover) and (pointer: fine)", undefined, { getInitialValueInEffect: false });
  useEffect(() => {
    const root = surface.current;
    const content = root?.closest<HTMLElement>('#practice-content');
    if (!root || !content) return;
    const active = () => root.getClientRects().length > 0 && !root.closest('[hidden]');
    return attachDirectionalSwipe(content, {
      active, axes:"both", dominance:1,
      ignore:'button, a, input, select, textarea, summary, [role="button"], [role="slider"], [contenteditable="true"], .practice-options, .scale-diagram:has(.scale-whole-route-board)',
      onSwipe:direction=>{
        if(direction==="left"||direction==="right")navigate("tonic",direction==="right"?1:-1);
        else navigate("shape",direction==="down"?1:-1);
      },
    });
  }, [navigate]);
  return (
    <section
      ref={surface}
      className="practice-surface scale-card sequence-practice"
      aria-labelledby="scale-title"
    >
      <Modal
        opened={s.shortcutsOpen}
        onClose={() => body.patch({ shortcutsOpen: false })}
        title="Scale keyboard shortcuts"
        centered
      >
        <Table aria-label="Scale keyboard shortcuts">
          <Table.Tbody>
            {[
              ["← / →", "Tonic down / up one semitone"],
              s.maqamReference
                ? ["↑ / ↓", "Hand position toward higher / lower frets"]
                : ["↓ / ↑", "Next / previous numbered shape"],
              ["[ / ]", "Shift down / up one octave (12 frets)"],
              ["?", "Show or hide keyboard shortcuts"],
              ["Esc", "Close this panel"],
            ].map(([keys, action]) => <Table.Tr key={keys}><Table.Td><Kbd>{keys}</Kbd></Table.Td><Table.Td>{action}</Table.Td></Table.Tr>)}
          </Table.Tbody>
        </Table>
        <Text size="sm" c="dimmed" mt="md">Linked shapes move together. Shape and octave shifts apply to individual shapes and pairs, and stop at the fretboard limits. Shortcuts pause while you use an input or this panel.</Text>
      </Modal>
      <div className="scale-heading">
        <div className="scale-heading-text">
          <Title order={2} id="scale-title">{s.title}</Title>
          {s.caption && <Text className="scale-pattern-caption" size="sm" role="status">{s.caption}</Text>}
        </div>
      </div>

      <div className="scale-toolbar" role="group" aria-label="Scale toolbar" tabIndex={-1} onChange={event=>{if(event.target instanceof HTMLSelectElement)event.currentTarget.focus({preventScroll:true});}}>
      <div className="scale-key-navigation" hidden={!s.movable}>
        {navigation}
      </div>
        <div className="scale-relative">{relative}</div>
      {s.wholeRoute && <section className="scale-whole-route" aria-label="Across fretboard route">
        <div className="scale-whole-route-heading"><NativeSelect aria-label="Scale route" size="xs" value={String(s.routeVariant)} data={s.routeChoices} onChange={event=>setRouteVariant(Number(event.currentTarget.value))} /><NativeSelect aria-label="Route direction" size="xs" value={s.routeDirection} data={[{value:'both',label:'Both ways'},{value:'up',label:'Up the neck'},{value:'down',label:'Down the neck'}]} onChange={event=>setRouteDirection(event.currentTarget.value as CagedRouteDirection)} /></div>
      </section>}
        {s.chordAvailable && <button type="button" className="scale-chord-trigger" ref={chordTrigger} aria-expanded={s.chordOpen} aria-controls="scale-chord-panel" onClick={()=>{setChordOpen(!s.chordOpen);setChordFrame(0);if(!s.chordOpen)setHorizontal(true);}}>{s.chordOpen ? "Hide chord shape" : "Show chord shape"}</button>}
        {s.shiftMode && <div className="scale-link-actions" role="group" aria-label="Linked shape controls">
          <Tooltip label="Reverse shapes" disabled={!hoverable} transitionProps={{ duration: 0 }}>
            <ActionIcon variant="subtle" size="md" aria-label="Reverse shapes" disabled={!s.canReverse} onClick={reverseLink}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" /></svg>
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Clear shift" disabled={!hoverable} transitionProps={{ duration: 0 }}>
            <ActionIcon className="scale-clear-shift" variant="subtle" size="md" aria-label="Clear shift" onClick={clearShift} disabled={!s.shiftSelected}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </ActionIcon>
          </Tooltip>
        </div>}
      </div>
      <div className="scale-link-legend">
        <span><i className="scale-root-swatch" aria-hidden="true" />Root</span>
        {s.blueNoteLabel && <span><i className="scale-blue-swatch" aria-hidden="true" />{s.blueNoteLabel}</span>}
        {s.omittedNoteLabel && <span><i className="scale-omitted-swatch" aria-hidden="true" />{s.omittedNoteLabel}</span>}

        {s.linkedLegend && <>
        {s.linkedLegend.split("|")
          .map((label, index) => ({ label, color: (index === 0) !== s.reversedColors ? "link-first" : "link-second" }))
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
          .map(({ label, color }) => <span key={label}><i className={color} />{label}</span>)}
        {!s.shiftSelected && <span><i className="link-shared" />Shared note</span>}
        <span><i className="link-shift" />Clickable shift</span>
        </>}

      </div>
      {s.shiftMode && s.shiftMessage && <Text className="scale-shift-status" size="sm" role="status">{s.shiftMessage}</Text>}
      {s.chordAvailable && s.chordOpen && activeChord && <section id="scale-chord-panel" className="scale-chord-panel" aria-label="Chord shape diagram">
        <div className="scale-chord-panel-header">
          <Text fw={600}>{activeChord.name}</Text>
          <Button variant="subtle" size="compact-sm" aria-label="Rotate chord diagram" aria-pressed={horizontal} onClick={()=>setHorizontal(!horizontal)}>↻ Rotate</Button>
          <ActionIcon variant="subtle" aria-label="Close chord diagram" onClick={()=>{setChordOpen(false);chordTrigger.current?.focus();}}>×</ActionIcon>
        </div>
        <GuitarChordGraphic name={activeChord.name} shapes={[activeChord.frets]} horizontal={horizontal} fingers={activeChord.fingers} barres={activeChord.barres} connectShape />
        <Text className="scale-chord-finger-key" size="xs" c="dimmed">1 index · 2 middle · 3 ring · 4 little finger</Text>
        {s.chordDiagrams.length>1 && <div className="scale-chord-panel-header">
          <Button size="compact-sm" variant="subtle" disabled={chordFrame===0} onClick={()=>setChordFrame(0)}>Previous fingering</Button>
          <Button size="compact-sm" variant="subtle" disabled={chordFrame===1} onClick={()=>setChordFrame(1)}>Next fingering</Button>
        </div>}
      </section>}
      {s.maqamReference && <Text className="scale-maqam-reference" size="sm" c="dimmed" mb="sm">{s.maqamReference}</Text>}
      <div className="scale-diagram" />

      {s.linkHelp && <Text className="scale-link-help">{s.linkHelp}</Text>}

    </section>
  );
}
