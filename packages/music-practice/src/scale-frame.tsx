import { useSyncExternalStore, type ReactNode } from "react";
import { Button, Kbd, Modal, Table, Text, Title } from "@mantine/core";
import { frameState } from "./practice-frame";
import { ScaleDetails } from "./scale-controls";
export const scaleBodyState = () =>
  frameState({
    title: "",
    shortcutsOpen: false,
    shiftMode: false,
    shiftSelected: false,
    direction: "ascending",
    shiftMessage: "",
    loopLeg: "out",
    returnEditing: false,
    linkedLegend: "",
    linkHelp: "",
    notes: "",
    relativeExplanation: "",
    movable: false,
    footnote: "",
    source: "",
    rows: [] as { string: number; notes: string }[],
  });
export function ScaleFrame({
  body,
  relative,
  navigation,
  changeDirection,
  clearShift,
  showLeg,
  editReturn,
}: {
  body: ReturnType<typeof scaleBodyState>;
  relative: ReactNode;
  navigation: ReactNode;
  changeDirection(): void;
  clearShift(): void;
  showLeg(leg: "out" | "back"): void;
  editReturn(): void;
}) {
  const s = useSyncExternalStore(body.subscribe, body.getSnapshot);
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
              ["↑ / ↓", "Next shape toward higher / lower frets"],
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
        {s.linkedLegend && <>
        <span><i className="link-first" />{s.linkedLegend.split("|")[0]}</span>
        <span><i className="link-second" />{s.linkedLegend.split("|")[1]}</span>
        {!s.shiftSelected && <span><i className="link-shared" />Shared note</span>}
        <span><i className="link-shift" />Clickable shift</span>
        </>}
        <span><i className="scale-root-swatch" aria-hidden="true" />Root</span>
      </div>
      {s.shiftMode && <div className="scale-shift-controls">
        <Button className="scale-direction-toggle" variant="default" size="xs" onClick={changeDirection}>{s.direction === "ascending" ? "Ascending ↑" : "Descending ↓"}</Button>
        <div className="scale-shift-status scale-loop-controls">
          {s.shiftSelected ? <Button size="xs" variant="subtle" aria-pressed={s.returnEditing} onClick={editReturn}>{s.returnEditing ? "Done choosing return" : "Change return shift"}</Button> : <Text size="sm" role="status">{s.shiftMessage}</Text>}
        </div>
        <Button className="scale-clear-shift" variant="subtle" size="xs" onClick={clearShift} disabled={!s.shiftSelected}>Clear shift</Button>
      </div>}
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
            <Text className="scale-source">
              Shapes and fingerings:{" "}
              <a href={s.source} target="_blank" rel="noopener noreferrer">
                GuitarScale.org
              </a>
            </Text>
          </div>
        </ScaleDetails>
      </div>
    </section>
  );
}
