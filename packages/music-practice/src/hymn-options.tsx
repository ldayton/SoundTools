import {guitarStaffShown,toggleGuitarStaff} from "./hymn-playback-staves";
import { hymnInstrument, hymnInstrumentArrangements } from "./hymn-instruments";
import {chordEdition} from "./chord-editions";
import { ToolbarNumber } from "@ldayton/ui/toolbar-number";
import { STAFF_HEIGHT } from "./notation-metrics";
import { ControlIcon } from "@ldayton/ui/control-icon";
import { TempoControl } from "@ldayton/ui/tempo-control";
import { useMediaQuery } from "@mantine/hooks";
import { MOBILE_SONGALONG_QUERY } from "./songalong-capabilities";
import {
  useSyncExternalStore,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  Accordion,
  Popover,
  ActionIcon,
  Anchor,
  Checkbox,
  CheckIcon,
  NativeSelect,
  Select,
  Group,
  Button,
  Divider,
  Combobox,
  useCombobox,
  TextInput,
  SimpleGrid,
  Stack,
  Text,
  Table,
} from "@mantine/core";
import {
  hasInstrumentEditions,
  isGuitarArrangement,
  isEditedGuitar,
  type Arrangement,
  type HymnHands,
} from "./hymn-arrangements";
import { HYMN_KEYS, hymnKeyLabel, type HymnKey } from "./hymn-transpose";
import type { CountInBars } from "./hymn-count-in";
import { hymnLibrary } from "./hymn-library";
import hymns from "./hymns.json";
import { HymnPitchField } from "./pitch-fields";
import type { HymnOptionsChange, HymnOptionsState } from "./hymn-options-state";
const hands = [
  { value: "both", label: "Both hands" },
  { value: "right", label: "Right hand" },
  { value: "left", label: "Left hand" },
];

const countIns = [
  { value: "0", label: "None" },
  { value: "0.5", label: "½ bar" },
  { value: "1", label: "1 bar" },
  { value: "2", label: "2 bars" },
];

export function HymnOptions({
  model,
  change,
}: {
  model: HymnOptionsState;
  change(patch: HymnOptionsChange): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const editions = hasInstrumentEditions({ id: state.hymn }) && state.arrangement !== "original";
  const profile=editions ? chordEdition({id:state.hymn}) : undefined;
  const arrangements = hymnInstrumentArrangements({id:state.hymn}, hymnInstrument(state.arrangement));
  const keys = [
    {
      value: "original",
      label: `Original (${state.originalKey.replace(/b/g, "♭").replace(/#/g, "♯")})`,
    },
    ...HYMN_KEYS.map((key) => ({ value: key, label: hymnKeyLabel(key) })),
  ].map((key) => ({
    ...key,
    shortLabel: key.label,
    label: `${key.label}${(key.value === state.key ? state.range : state.keyRanges[key.value as HymnKey]) ? ` (${key.value === state.key ? state.range : state.keyRanges[key.value as HymnKey]})` : ""}`,
    disabled: !state.availableKeys.includes(key.value as HymnKey),
  }));
  return (
    <Stack className="soundtools-ui" gap="md">
      {state.mode === "playback" && (
        <OptionsSection title="Playback">
          <NativeSelect
            id="hymn-count-in"
            className="hymn-count-in-field"
            label="Count-in"
            value={String(state.unmetered ? 0 : state.countIn)}
            description={
              state.unmetered
                ? "This hymn has no meter, so a bar count-in is unavailable."
                : undefined
            }
            data={countIns.map((option) => ({
              ...option,
              disabled: state.unmetered && option.value !== "0",
            }))}
            onChange={(event) =>
              change({
                countIn: Number(event.currentTarget.value) as CountInBars,
              })
            }
          />
          <Checkbox
            id="hymn-loop-count-in"
            label="Count in before each loop"
            disabled={state.unmetered || state.countIn === 0}
            checked={state.loopCountIn}
            onChange={(event) =>
              change({ loopCountIn: event.currentTarget.checked })
            }
          />
        </OptionsSection>
      )}
      {state.arrangement !== "guitar-edition" && <OptionsSection title="Key & range">
        <Stack gap="xs">
          <SimpleGrid cols={2} spacing="xs">
            {(["low", "high"] as const).map((bound) => (
              <HymnPitchField
                key={bound}
                bound={bound}
                value={state[bound]}
                onChange={(value) => change({ [bound]: value })}
              />
            ))}
          </SimpleGrid>
          <Select
            id="hymn-key"
            name="hymn-key"
            label="Key"
            aria-label="Hymn key"
            value={state.noMatchingKey ? null : state.key}
            placeholder="No matching key"
            data={keys}
            allowDeselect={false}
            comboboxProps={{ withinPortal: false, position: "bottom-start" }}
            onOptionSubmit={(key) => change({ key: key as HymnKey })}
            renderOption={({ option, checked }) => (
              <Group gap="xs" wrap="nowrap" w="100%">
                <span style={{ width: 12, flexShrink: 0 }} aria-hidden="true">
                  {checked && <CheckIcon size={12} />}
                </span>
                <Text component="span" size="sm">
                  {keys.find(key=>key.value===option.value)?.shortLabel || option.label}
                </Text>
                <Text
                  component="span"
                  className="hymn-key-option-range"
                  size="xs"
                  c="dimmed"
                  ml="auto"
                  style={{ whiteSpace: "nowrap" }}
                >
                  {state.keyRanges[option.value as HymnKey]}
                </Text>
              </Group>
            )}
          />
          <Group gap="xs" grow>
            <Button
              id="hymn-octave-down"
              variant="default"
              disabled={
                state.noMatchingKey ||
                !state.availableOctaves.includes(state.octave - 1)
              }
              onClick={() => change({ octave: state.octave - 1 })}
            >
              ↓ Octave
            </Button>
            <Button
              id="hymn-octave-up"
              variant="default"
              disabled={
                state.noMatchingKey ||
                !state.availableOctaves.includes(state.octave + 1)
              }
              onClick={() => change({ octave: state.octave + 1 })}
            >
              ↑ Octave
            </Button>
          </Group>
        </Stack>
      </OptionsSection>}
      {state.mode === "playback" && <OptionsSection title="Staves">
        <Table className="hymn-staff-table" aria-label="Playback staves">
          <Table.Thead><Table.Tr><Table.Th>Staff</Table.Th><Table.Th>Show</Table.Th><Table.Th>Play</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{state.playbackStaves.map(staff=><Table.Tr key={staff.index}>
            <Table.Td>{staff.label}</Table.Td>
            {(["hiddenStaves","mutedStaves"] as const).map((field,index)=><Table.Td key={field}>
              <Checkbox aria-label={`${index===0 ? "Show" : "Play"} ${staff.label}`}
                disabled={index===1 && staff.playable===false}
                title={index===1 && staff.playable===false ? "Playback follows Treble" : undefined}
                checked={index===0 && staff.display ? guitarStaffShown(state.scoreDisplay,state.hiddenStaves,staff.display) : staff.playable===false ? false : !state[field].includes(staff.index)}
                onChange={event=>change(index===0 && staff.display
                  ? {viewHands:"both",...toggleGuitarStaff(state.scoreDisplay,state.hiddenStaves,staff.display,event.currentTarget.checked)}
                  : {viewHands:"both",hiddenStaves:state.hiddenStaves,mutedStaves:state.mutedStaves,
                    [field]:event.currentTarget.checked ? state[field].filter(n=>n!==staff.index) : [...state[field],staff.index]})}/>
            </Table.Td>)}
          </Table.Tr>)}
          {state.chordSymbolsAvailable && <Table.Tr>
            <Table.Td>Chords</Table.Td>
            <Table.Td><Checkbox aria-label="Show Chords" checked={state.showChordSymbols} onChange={event=>change({showChordSymbols:event.currentTarget.checked})}/></Table.Td>
            <Table.Td><Checkbox aria-label="Play Chords" checked={false} disabled title="Playback follows the written notes"/></Table.Td>
          </Table.Tr>}
          </Table.Tbody>
        </Table>
      </OptionsSection>}
      {(!editions || state.stanzaChoices.length>1) && (state.arrangement === "melody" ||
        isGuitarArrangement(state.arrangement) ||
        state.viewHands !== "left") && (
        <OptionsSection title="Stanzas">
          <Stack id="hymn-stanzas" gap="xs" role="group" aria-label="Stanzas">
            {state.stanzaChoices.map((stanza) => (
              <Checkbox
                key={stanza.number}
                className="hymn-stanza-checkbox"
                label={stanza.label}
                title={stanza.label}
                checked={state.stanzas.includes(stanza.number)}
                onChange={(event) =>
                  change({
                    stanzas: event.currentTarget.checked
                      ? [...state.stanzas, stanza.number]
                      : state.stanzas.filter(
                          (number) => number !== stanza.number,
                        ),
                  })
                }
                styles={{
                  labelWrapper: { minWidth: 0, flex: 1 },
                  label: {
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  },
                }}
              />
            ))}
          </Stack>
        </OptionsSection>
      )}
      {editions ? (
        <>
          <OptionsSection title="Display">
            {isEditedGuitar(state.arrangement) ? (
              <NativeSelect
                id="hymn-score-display"
                label="Score"
                value={state.scoreDisplay}
                data={[
                  {value:"notation",label:"Notation"},
                  {value:"tab",label:"Tablature"},
                  {value:"both",label:"Notation and tablature"},
                  ...(profile ? [{value:"chords",label:"Chords only"}] : []),
                ]}
                onChange={event => change({scoreDisplay: event.currentTarget.value as "notation" | "tab" | "both" | "chords"})}
              />
            ) : <Text size="sm">Grand staff</Text>}
          </OptionsSection>
          {state.mode === "wait" && (
            <OptionsSection title="Practice">
              {state.arrangement === "guitar-edition" && !profile ? <Text size="sm">Practise the chord accompaniment.</Text> : <NativeSelect
                id="hymn-hands"
                label={state.arrangement === "piano" ? "Practise hands" : "Practise part"}
                value={state.hands}
                data={state.arrangement === "piano" ? hands : profile ? [
                  {value:"both",label:"Full fingerstyle"},
                  {value:"right",label:"Melody"},
                  {value:"left",label:"Chord accompaniment"},
                ] : [
                  {value:"both",label:"Melody and bass"},
                  {value:"right",label:"Melody"},
                  {value:"left",label:"Bass"},
                ]}
                onChange={event => change({hands:event.currentTarget.value as HymnHands})}
              />}
              <Checkbox
                id="hymn-reattack-ties"
                label="Re-strike tied notes"
                checked={state.reattackTies}
                onChange={event => change({reattackTies:event.currentTarget.checked})}
              />
            </OptionsSection>
          )}
        </>
      ) : <OptionsSection
        title={hymnInstrument(state.arrangement) === "sung" ? "Voice + Piano" : "Piano arrangements"}
      >
        {arrangements.length > 1 && (
          <NativeSelect id="hymn-arrangement" label="Arrangement" value={state.arrangement}
            data={arrangements.map(arrangement=>({value:arrangement.id,label:arrangement.label}))}
            onChange={event=>change({arrangement:event.currentTarget.value as Arrangement})}/>
        )}
        {state.mode === "wait" && state.arrangement !== "melody" &&
          !isGuitarArrangement(state.arrangement) && (
            <SimpleGrid cols={state.mode === "wait" ? 2 : 1} spacing="xs">
              <NativeSelect
                id="hymn-view"
                className="hymn-view-field"
                label="Show"
                data={hands}
                value={state.viewHands}
                onChange={(event) =>
                  change({ viewHands: event.currentTarget.value as HymnHands })
                }
              />
              {state.mode === "wait" && (
                <NativeSelect
                  id="hymn-hands"
                  className="hymn-hands-field"
                  label="Practise hands"
                  value={state.hands}
                  data={hands.map((hand) => ({
                    ...hand,
                    disabled:
                      state.viewHands !== "both" &&
                      state.viewHands !== hand.value,
                  }))}
                  onChange={(event) =>
                    change({ hands: event.currentTarget.value as HymnHands })
                  }
                />
              )}
            </SimpleGrid>
          )}
        {state.mode === "wait" && (
          <Checkbox
            id="hymn-reattack-ties"
            label="Re-strike tied notes"
            checked={state.reattackTies}
            onChange={(event) =>
              change({ reattackTies: event.currentTarget.checked })
            }
          />
        )}
      </OptionsSection>}
      <Accordion id="hymn-source" order={3}>
        {editions && <Accordion.Item value="reading-guide">
          <Accordion.Control>Reading guide</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              {profile ? <>
                <Text size="sm">{profile.guide.meter}</Text>
                {state.arrangement === "piano" ? <Text size="sm">Play the melody with your right hand and held harmony with your left. Small numbers suggest fingers: 1 is thumb, 5 is little finger. {profile.guide.piano}</Text> : <>
                  <Text size="sm">Standard tuning · {profile.capo ? `Capo ${profile.capo}; frets and chord symbols are relative to the capo.` : 'No capo.'} Sounding key: {state.originalKey} major. For chord accompaniment, strum at each chord symbol and let it ring.</Text>
                  <Text size="sm">Melody stems point up; bass/harmony stems point down. Use your thumb for bass, index for inner harmony, and middle or ring for melody. {profile.guide.guitar}</Text>
                  <Text size="sm">For strumming use {profile.shapes}. {profile.guide.strum} Small numbers beside notation are fingers; numbers on tab lines are frets.</Text>
                  <Text size="sm">Chords only hides the notes. Select Chord accompaniment separately under Practice to practise strumming. Dots add half the duration; double stems in tab indicate half notes, double beams sixteenths. Ties sustain notes without plucking again.</Text>
                </>}
              </> : <>
              <Text size="sm">A, B and C are four-bar phrases. Repeat these twelve bars, then play the Ending.</Text>
              {state.arrangement === "piano" ? <Text size="sm">Small numbers suggest fingers: 1 is the thumb, 5 is the little finger. Fingerings mark starting patterns and hand changes. The final left-hand chord spans only a fifth.</Text> : <>
                <Text size="sm">Numbers on tab lines are frets. Small 1–4 beside the notes are fretting fingers: index to little finger. Circled numbers identify strings. Open strings need no fretting finger.</Text>
                <Text size="sm">Picking fingers: p = thumb, i = index, m = middle, a = ring. Use the thumb for the bass and alternate i and m for the melody.</Text>
                <Text size="sm">In rhythmic tab, melody stems point up and bass stems point down. Half notes have double stems; whole notes have no stem. A tie means hold the note without plucking again.</Text>
              </>}
              <Text size="sm">Swing: play eighth-note pairs long–short. Keep the bass pulse steady while practising the melody.</Text>
              </>}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>}
        <Accordion.Item value="source">
          <Accordion.Control>{editions ? "About this song" : "About this hymn"}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              {state.source.referenceUrl && (
                <Anchor
                  href={state.source.referenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Reference recording
                  {state.source.referenceDetails
                    ? ` (${state.source.referenceDetails})`
                    : ""}
                </Anchor>
              )}
              <Text size="sm" className="hymn-credits">
                {state.source.credits}
              </Text>
              <Anchor
                className="hymn-source-link"
                href={state.source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {state.source.label}
              </Anchor>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
function OptionsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Stack component="section" aria-label={title} gap="xs">
      <Divider label={title} labelPosition="left" />
      {children}
    </Stack>
  );
}

export function HymnSelector({
  model,
  change,
  searchOpened,
}: {
  model: HymnOptionsState;
  change(patch: HymnOptionsChange): void;
  searchOpened(open: boolean): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const [query, setQuery] = useState("");
  const list = useCombobox({ opened: true });
  const matches = useMemo(
    () => hymnLibrary(hymns, query, state.favorites),
    [query, state.favorites],
  );
  useEffect(() => {
    if (query) list.selectFirstOption();
    else list.selectOption(matches.findIndex((hymn) => hymn.id === state.hymn));
  }, [query, state.hymn, matches]);
  return (
    <Stack className="hymn-library" gap="xs">
      <Combobox
        store={list}
        onOptionSubmit={(hymn) => {
          setQuery("");
          searchOpened(false);
          change({ hymn });
        }}
      >
        <Combobox.EventsTarget>
          <TextInput
            id="hymn-search"
            placeholder="Search songs"
            aria-label="Hymn"
            role="combobox"
            aria-expanded="true"
            aria-controls="hymn-library-list"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
                event.stopPropagation();
              }
            }}
            onFocus={() => searchOpened(true)}
            onBlur={() => searchOpened(false)}
          />
        </Combobox.EventsTarget>
        <div className="hymn-library-list">
          <Combobox.Options id="hymn-library-list">
            {matches.map((hymn) => (
              <Combobox.Option
                key={hymn.id}
                value={hymn.id}
                active={hymn.id === state.hymn}
                aria-selected={hymn.id === state.hymn}
              >
                <Group gap="xs" wrap="nowrap">
                  {state.favorites[hymn.id] === true && (
                    <ControlIcon name="star" filled size={14} />
                  )}
                  <Text size="sm">{hymn.title}</Text>
                </Group>
              </Combobox.Option>
            ))}
            {!matches.length && (
              <Combobox.Empty>
                No hymns found. Try another title.
              </Combobox.Empty>
            )}
          </Combobox.Options>
        </div>
      </Combobox>
    </Stack>
  );
}

export function HymnFavorite({
  model,
  toggle,
}: {
  model: HymnOptionsState;
  toggle(): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const favorite = state.favorites[state.hymn] === true;
  const label = favorite ? "Remove from favorites" : "Add to favorites";
  return (
    <ActionIcon
      className="hymn-favorite"
      variant="subtle"
      color={favorite ? "yellow" : "gray"}
      size={44}
      aria-label={label}
      aria-pressed={favorite}
      title={label}
      onClick={toggle}
    >
      <ControlIcon name="star" size={24} filled={favorite} />
    </ActionIcon>
  );
}

export function HymnModeAndTempo({
  model,
  change,
}: {
  model: HymnOptionsState;
  change(patch: HymnOptionsChange): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const mobile = useMediaQuery(MOBILE_SONGALONG_QUERY, undefined, {
    getInitialValueInEffect: false,
  });
  return (
    <>
      {!mobile && (
        <div className="hymn-toolbar-field">
          <Text className="hymn-toolbar-field-label" size="sm">
            Mode
          </Text>
          <Button
            id="hymn-mode"
            variant={state.mode === "playback" ? "light" : "default"}
            className="hymn-mode-toggle"
            aria-label="Playback mode"
            aria-pressed={state.mode === "playback"}
            data-mode={state.mode}
            title={`Switch to ${state.mode === "wait" ? "Playback" : "Wait for me"}`}
            onClick={() =>
              change({ mode: state.mode === "wait" ? "playback" : "wait" })
            }
          >
            {state.mode === "wait" ? "Wait for me" : "Playback"}
          </Button>
        </div>
      )}
      <div className="hymn-toolbar-field">
        <Text className="hymn-toolbar-field-label" size="sm">
          Tempo
        </Text>
        <TempoControl
          id="hymn-tempo"
          compact
          disabled={state.mode !== "playback"}
          value={state.bpm}
          min={40}
          max={200}
          onChange={(bpm) => change({ bpm })}
        />
      </div>
    </>
  );
}

export function HymnStaffSize({
  model,
  change,
}: {
  model: HymnOptionsState;
  change(patch: HymnOptionsChange): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <ToolbarNumber
      id="hymn-size"
      label="Staff size in pixels"
      icon={<ControlIcon name="text-size" />}
      unit="px"
      min={STAFF_HEIGHT / 2}
      max={STAFF_HEIGHT * 2}
      value={Math.round(state.zoom * STAFF_HEIGHT)}
      onChange={(pixels) => change({ zoom: pixels / STAFF_HEIGHT })}
    />
  );
}

export function HymnFingerings({
  model,
  change,
}: {
  model: HymnOptionsState;
  change(patch: HymnOptionsChange): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const mobile = useMediaQuery(MOBILE_SONGALONG_QUERY, undefined, {
    getInitialValueInEffect: false,
  });
  if (state.arrangement === "guitar-chords" || state.arrangement === "guitar-edition" && ["tab", "chords"].includes(state.scoreDisplay)) return null;
  const editions = hasInstrumentEditions({id:state.hymn}) && state.arrangement !== "original";
  const reviewed = (state.key === "original" || state.key === state.originalKey) &&
    (state.arrangement === "piano" || state.octave === 0);
  const checkbox = (
    <Checkbox
      id="hymn-fingerings"
      className="hymn-fingerings-field"
      aria-label="Show fingerings"
      label={mobile ? undefined : "Show fingerings"}
      size={mobile ? "sm" : "xs"}
      checked={state.fingerings}
      title={editions && !reviewed ? "Fingerings are provided for the original key and guitar position." : undefined}
      disabled={editions ? !reviewed :
        state.arrangement !== "melody" &&
        state.arrangement !== "bass" &&
        !isGuitarArrangement(state.arrangement)
      }
      onChange={(event) => change({ fingerings: event.currentTarget.checked })}
    />
  );
  return mobile ? (
    <Group justify="space-between" wrap="nowrap" w="100%">
      <Text component="label" htmlFor="hymn-fingerings" size="sm">
        Show fingerings
      </Text>
      {checkbox}
    </Group>
  ) : (
    checkbox
  );
}

export function HymnStaffSpacing({
  model,
  change,
}: {
  model: HymnOptionsState;
  change(patch: HymnOptionsChange): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const mobile = useMediaQuery(MOBILE_SONGALONG_QUERY, undefined, {
    getInitialValueInEffect: false,
  });
  const control = (
    <ToolbarNumber
      id="hymn-staff-spacing"
      label="Staff spacing"
      icon={<ControlIcon name="staff-spacing" />}
      unit="%"
      min={80}
      max={120}
      step={2}
      value={state.staffSpacing}
      onChange={(staffSpacing) => change({ staffSpacing })}
    />
  );
  return mobile ? (
    control
  ) : (
    <Popover position="bottom-start" withArrow>
      <Popover.Target>
        <ActionIcon
          variant="default"
          size={36}
          aria-label="Adjust staff spacing"
          title={`Staff spacing: ${state.staffSpacing}%`}
        >
          <ControlIcon name="staff-spacing" />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Group gap="md" wrap="nowrap">
          <Text size="sm">Staff spacing</Text>
          {control}
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}
