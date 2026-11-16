import { ToolbarNumber } from "@ldayton/ui/toolbar-number";
import { STAFF_HEIGHT } from "./notation-metrics";
import { ControlIcon } from "@ldayton/ui/control-icon";
import { TempoControl } from "@ldayton/ui/tempo-control";
import {
  useSyncExternalStore,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import {
  Accordion,
  Anchor,
  Checkbox,
  NativeSelect,
  Group,
  Button,
  Divider,
  Combobox,
  useCombobox,
  TextInput,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import {
  ARRANGEMENTS,
  type Arrangement,
  type HymnHands,
} from "./hymn-arrangements";
import { HYMN_KEYS, hymnKeyLabel, type HymnKey } from "./hymn-transpose";
import type { CountInBars } from "./hymn-count-in";
import { searchHymns } from "./sight-reading-model";
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
  const keys = [
    {
      value: "original",
      label: `Original (${state.originalKey.replace(/b/g, "♭").replace(/#/g, "♯")})`,
    },
    ...HYMN_KEYS.map((key) => ({ value: key, label: hymnKeyLabel(key) })),
  ].map((key) => ({
    ...key,
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
        </OptionsSection>
      )}
      <OptionsSection title="Pitch">
        <NativeSelect
          id="hymn-key"
          label="Key"
          aria-label="Hymn key"
          value={state.noMatchingKey ? "" : state.key}
          onChange={(event) =>
            change({ key: event.currentTarget.value as HymnKey })
          }
        >
          {state.noMatchingKey && (
            <option value="" disabled hidden>
              No matching key
            </option>
          )}
          {keys.map((key) => (
            <option key={key.value} value={key.value} disabled={key.disabled}>
              {key.label}
            </option>
          ))}
        </NativeSelect>
        <Text
          className="hymn-key-range"
          size="xs"
          c="dimmed"
          aria-live="polite"
          hidden={state.noMatchingKey}
        >
          {state.range}
        </Text>
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
        <Text size="xs" c="dimmed">
          Optional melody limits
        </Text>
      </OptionsSection>
      <OptionsSection title="Hands">
        <NativeSelect
          id="hymn-arrangement"
          label="Arrangement"
          value={state.arrangement}
          data={ARRANGEMENTS.map((a) => ({ value: a.id, label: a.label }))}
          onChange={(event) =>
            change({ arrangement: event.currentTarget.value as Arrangement })
          }
        />
        {state.arrangement !== "melody" && (
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
      </OptionsSection>
      <Accordion id="hymn-source" order={3}>
        <Accordion.Item value="source">
          <Accordion.Control>About this hymn</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
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
              <Text size="sm">{state.source.description}</Text>
              <Text size="sm">{state.source.help}</Text>
              <Text size="sm">{state.source.transposition}</Text>
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
  const matches = searchHymns(hymns, query);
  useEffect(() => {
    if (query) list.selectFirstOption();
    else list.selectOption(hymns.findIndex((hymn) => hymn.id === state.hymn));
  }, [query, state.hymn]);
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
                <Text size="sm">{hymn.title}</Text>
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

export function HymnModeAndTempo({
  model,
  change,
}: {
  model: HymnOptionsState;
  change(patch: HymnOptionsChange): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <>
      <Button
        id="hymn-mode"
        variant={state.mode === "playback" ? "light" : "default"}
        w={112}
        miw={112}
        px="xs"
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
      <TempoControl
        id="hymn-tempo"
        compact
        disabled={state.mode !== "playback"}
        value={state.bpm}
        min={40}
        max={200}
        onChange={(bpm) => change({ bpm })}
      />
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
