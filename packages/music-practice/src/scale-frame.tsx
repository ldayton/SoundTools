import type { cagedChordDiagram } from "./guitar-scale-patterns";
import { GuitarChordGraphic } from "./guitar-chord-diagram";
import { useMediaQuery } from "@mantine/hooks";
import { useSyncExternalStore, useState, useRef, type ReactNode } from "react";
import { ActionIcon, Button, Kbd, Modal, Table, Text, Title, Tooltip } from "@mantine/core";
import { frameState } from "./practice-frame";
import { ScaleDetails } from "./scale-controls";
export const scaleBodyState = () =>
  frameState({
    title: "",
    shortcutsOpen: false,
    shiftMode: false,
    shiftSelected: false,
    canReverse: false,
    shiftMessage: "",
    linkedLegend: "",
    chordOutline: false,
    blueNoteLabel: "",
    omittedNoteLabel: "",
    chordDiagrams: [] as ReturnType<typeof cagedChordDiagram>[],
    reversedColors: false,
    linkHelp: "",
    notes: "",
    relativeExplanation: "",
    movable: false,
    footnote: "",
    source: "",
    sourceLabel: "GuitarScale.org",
    maqamReference: "",
    rows: [] as { string: number; notes: string }[],
  });
export function ScaleFrame({
  body,
  relative,
  navigation,
  clearShift,
  reverseLink,
}: {
  body: ReturnType<typeof scaleBodyState>;
  relative: ReactNode;
  navigation: ReactNode;
  clearShift(): void;
  reverseLink(): void;
}) {
  const s = useSyncExternalStore(body.subscribe, body.getSnapshot);
  const [chordOpen,setChordOpen]=useState(false);
  const [horizontal,setHorizontal]=useState(true);
  const [chordFrame,setChordFrame]=useState(0);
  const chordTrigger=useRef<HTMLButtonElement>(null);
  const activeChord=s.chordDiagrams[Math.min(chordFrame,s.chordDiagrams.length-1)];
  const hoverable = useMediaQuery("(min-width: 48em) and (hover: hover) and (pointer: fine)", undefined, { getInitialValueInEffect: false });
  return (
    <section
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
              ["↑ / ↓", "Next shape or hand position toward higher / lower frets"],
              ["[ / ]", "Shift down / up one octave (12 frets)"],
              ["?", "Show or hide keyboard shortcuts"],
              ["Esc", "Close this panel"],
            ].map(([keys, action]) => <Table.Tr key={keys}><Table.Td><Kbd>{keys}</Kbd></Table.Td><Table.Td>{action}</Table.Td></Table.Tr>)}
          </Table.Tbody>
        </Table>
        <Text size="sm" c="dimmed" mt="md">Linked shapes move together. Shape and octave shifts apply to movable shapes and stop at the fretboard limits. Shortcuts pause while you use an input or this panel.</Text>
      </Modal>
      <div className="scale-heading">
        <Title order={2} id="scale-title">
          {s.title}
        </Title>
        <div className="scale-relative">{relative}</div>
      </div>
      <div className="scale-key-navigation" hidden={!s.movable}>
        {navigation}
      </div>
      <div className="scale-link-legend">
        <span><i className="scale-root-swatch" aria-hidden="true" />Root</span>
        {s.blueNoteLabel && <span><i className="scale-blue-swatch" aria-hidden="true" />{s.blueNoteLabel}</span>}
        {s.omittedNoteLabel && <span><i className="scale-omitted-swatch" aria-hidden="true" />{s.omittedNoteLabel}</span>}
        {s.chordOutline && <button type="button" className="scale-chord-trigger" ref={chordTrigger} aria-expanded={chordOpen} aria-controls="scale-chord-panel" aria-label="Show chord shape diagram" onClick={()=>{setChordOpen(!chordOpen);setChordFrame(0);if(!chordOpen)setHorizontal(true);}}><i className="scale-chord-swatch" aria-hidden="true" />Chord shape</button>}
        {s.linkedLegend && <>
        {s.linkedLegend.split("|")
          .map((label, index) => ({ label, color: (index === 0) !== s.reversedColors ? "link-first" : "link-second" }))
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
          .map(({ label, color }) => <span key={label}><i className={color} />{label}</span>)}
        {!s.shiftSelected && <span><i className="link-shared" />Shared note</span>}
        <span><i className="link-shift" />Clickable shift</span>
        </>}
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
      {s.shiftMode && s.shiftMessage && <Text className="scale-shift-status" size="sm" role="status">{s.shiftMessage}</Text>}
      {s.chordOutline && chordOpen && activeChord && <section id="scale-chord-panel" className="scale-chord-panel" aria-label="Chord shape diagram">
        <div className="scale-chord-panel-header">
          <Text fw={600}>{activeChord.name}</Text>
          <Button variant="subtle" size="compact-sm" aria-label="Rotate chord diagram" aria-pressed={horizontal} onClick={()=>setHorizontal(!horizontal)}>↻ Rotate</Button>
          <ActionIcon variant="subtle" aria-label="Close chord diagram" onClick={()=>{setChordOpen(false);chordTrigger.current?.focus();}}>×</ActionIcon>
        </div>
        <Text size="sm" c="dimmed">{activeChord.explanation}</Text>
        <GuitarChordGraphic name={activeChord.name} shapes={[activeChord.frets]} horizontal={horizontal} fingers={activeChord.fingers} barres={activeChord.barres} />
        <Text className="scale-chord-finger-key" size="xs" c="dimmed">1 index · 2 middle · 3 ring · 4 little finger</Text>
        {activeChord.barres.length > 0 && <Text className="scale-chord-barre-help" size="xs" c="dimmed">A connected bar is one finger across several strings.</Text>}
        {s.chordDiagrams.length>1 && <div className="scale-chord-panel-header">
          <Button size="compact-sm" variant="subtle" disabled={chordFrame===0} onClick={()=>setChordFrame(0)}>Previous fingering</Button>
          <Button size="compact-sm" variant="subtle" disabled={chordFrame===1} onClick={()=>setChordFrame(1)}>Next fingering</Button>
        </div>}
      </section>}
      {s.maqamReference && <Text className="scale-maqam-reference" size="sm" c="dimmed" mb="sm">{s.maqamReference}</Text>}
      <div className="scale-diagram" />
      {s.linkHelp && <Text className="scale-link-help">{s.linkHelp}</Text>}
      <Button className="scale-shortcuts-button" variant="subtle" size="compact-xs" aria-keyshortcuts="?" onClick={() => body.patch({ shortcutsOpen: true })}>Keyboard shortcuts (?)</Button>
      <div className="scale-note-list">
        <ScaleDetails>
          <div className="scale-detail-body">
            <Text className="scale-notes">{s.notes}</Text>
            <Text className="scale-help">
              Standard tuning · high E at the top, low E at the bottom.
            </Text>
            <Text className="scale-footnote">{s.footnote}</Text>
            <Text className="scale-optional-legend" hidden={s.movable}>
              Gray notes can also be played on the next open string.
            </Text>
            <Text className="scale-relative-explanation">
              {s.relativeExplanation}
            </Text>
            <div className="scale-note-table">
              <Table>
                <caption>{s.title} · sounding pitches</caption>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>String</Table.Th>
                    <Table.Th>Fret: note</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {s.rows.map((row) => (
                    <Table.Tr key={row.string}>
                      <Table.Th scope="row">
                        {row.string}
                        {row.string === 6
                          ? " · low E"
                          : row.string === 1
                            ? " · high E"
                            : ""}
                      </Table.Th>
                      <Table.Td>{row.notes}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
            {s.source ? <Text className="scale-source">
              {s.maqamReference ? "Maqam reference: " : "Shapes and fingerings: "}
              <a href={s.source} target="_blank" rel="noopener noreferrer">
                {s.sourceLabel}
              </a>
            </Text> : <Text className="scale-source">Shapes supplied by Hila Bar.</Text>}
          </div>
        </ScaleDetails>
      </div>
    </section>
  );
}
