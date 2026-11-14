import { TempoControl } from "@ldayton/ui/tempo-control";
import { useSyncExternalStore } from "react";
import {
  Accordion,
  Anchor,
  Checkbox,
  NativeSelect,
  Select,
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
const hymnChoices = hymns.map((h) => ({ value: h.id, label: h.title }));
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
    <Stack className="soundtools-ui">
      <SimpleGrid cols={2}>
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
        <NativeSelect
          id="hymn-size"
          label="Score size"
          aria-label="Score size"
          value={String(state.zoom)}
          onChange={(event) =>
            change({ zoom: Number(event.currentTarget.value) })
          }
          data={[
            { value: "0.85", label: "Small" },
            { value: "1", label: "Medium" },
            { value: "1.2", label: "Large" },
          ]}
        />
      </SimpleGrid>
      <Text
        className="hymn-key-range"
        size="sm"
        c="dimmed"
        aria-live="polite"
        hidden={state.noMatchingKey}
      >
        {state.range}
      </Text>
      <SimpleGrid cols={2}>
        {(["low", "high"] as const).map((bound) => (
          <HymnPitchField
            key={bound}
            bound={bound}
            value={state[bound]}
            onChange={(value) => change({ [bound]: value })}
          />
        ))}
      </SimpleGrid>
      <Text size="sm" c="dimmed">
        Melody range, across the whole hymn.
      </Text>
      <NativeSelect
        id="hymn-mode"
        label="Mode"
        value={state.mode}
        onChange={(event) =>
          change({ mode: event.currentTarget.value as "wait" | "playback" })
        }
        data={[
          { value: "wait", label: "Wait for me" },
          { value: "playback", label: "Playback" },
        ]}
      />
      {state.mode === "playback" && (
        <Stack gap="sm">
          <TempoControl
            id="hymn-tempo"
            value={state.bpm}
            min={40}
            max={200}
            onChange={(bpm) => change({ bpm })}
          />
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
        </Stack>
      )}
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
        <SimpleGrid cols={state.mode === "wait" ? 2 : 1}>
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
                  state.viewHands !== "both" && state.viewHands !== hand.value,
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
  const selectedTitle = hymns.find((h) => h.id === state.hymn)!.title;
  return (
    <Select
      id="hymn-search"
      comboboxProps={{ withinPortal: false, transitionProps: { duration: 0 } }}
      // Native scrolling avoids ScrollArea resize feedback as the mobile drawer closes.
      withScrollArea={false}
      styles={{ dropdown: { maxHeight: 280, overflowY: "auto" } }}
      label="Hymn"
      searchable
      selectFirstOptionOnChange
      selectFirstOptionOnDropdownOpen
      allowDeselect={false}
      value={state.hymn}
      data={hymnChoices}
      dropdownOpened={state.searchOpen}
      onDropdownOpen={() => searchOpened(true)}
      onDropdownClose={() => searchOpened(false)}
      onChange={(value) => {
        if (typeof value === "string") change({ hymn: value });
      }}
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => {
        if (event.currentTarget.value === selectedTitle)
          event.currentTarget.select();
      }}
      nothingFoundMessage="No hymns found. Try another title."
      filter={({ search }) =>
        searchHymns(hymns, search === selectedTitle ? "" : search).map((h) => ({
          value: h.id,
          label: h.title,
        }))
      }
      classNames={{ dropdown: "soundtools-ui" }}
    />
  );
}
