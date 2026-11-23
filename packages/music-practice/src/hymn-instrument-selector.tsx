import { useSyncExternalStore } from "react";
import { Button, Group } from "@mantine/core";
import { ControlIcon } from "@ldayton/ui/control-icon";
import {
  hymnInstrument,
  hymnInstrumentChoices,
  hymnInstrumentArrangements,
  selectHymnInstrument,
} from "./hymn-instruments";
import type { HymnOptionsState, HymnOptionsChange } from "./hymn-options-state";
export function HymnInstrumentSelector({
  model,
  change,
}: {
  model: HymnOptionsState;
  change(patch: HymnOptionsChange): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const selected = hymnInstrument(state.arrangement);
  const enabled = hymnInstrumentChoices.filter(
    (instrument) =>
      hymnInstrumentArrangements({ id: state.hymn }, instrument.id).length,
  );
  return (
    <Group
      className="hymn-toolbar-instruments"
      role="radiogroup"
      aria-label="Instrument"
      gap={0}
      wrap="nowrap"
    >
      {hymnInstrumentChoices.map((instrument) => {
        const available = hymnInstrumentArrangements(
          { id: state.hymn },
          instrument.id,
        );
        const choose = () => {
          const arrangement = selectHymnInstrument(
            { id: state.hymn },
            state.arrangement,
            instrument.id,
          );
          if (arrangement && arrangement !== state.arrangement)
            change({ arrangement });
        };
        return (
          <Button
            key={instrument.id}
            type="button"
            role="radio"
            aria-label={instrument.label}
            aria-checked={selected === instrument.id}
            data-instrument={instrument.id}
            data-arrangement={state.arrangement}
            disabled={!available.length}
            tabIndex={selected === instrument.id ? 0 : -1}
            title={
              available.length
                ? instrument.label
                : `${instrument.label} is not available for this song`
            }
            variant={selected === instrument.id ? "light" : "default"}
            px={0}
            onClick={choose}
            onKeyDown={(event) => {
              const key = event.key;
              if (
                ![
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                ].includes(key)
              )
                return;
              event.preventDefault();
              const index = enabled.findIndex(
                (choice) => choice.id === instrument.id,
              );
              const next =
                enabled[
                  key === "Home"
                    ? 0
                    : key === "End"
                      ? enabled.length - 1
                      : (index +
                          (["ArrowLeft", "ArrowUp"].includes(key) ? -1 : 1) +
                          enabled.length) %
                        enabled.length
                ];
              if (!next) return;
              const arrangement = selectHymnInstrument(
                { id: state.hymn },
                state.arrangement,
                next.id,
              );
              if (arrangement) change({ arrangement });
              event.currentTarget.parentElement
                ?.querySelector<HTMLButtonElement>(
                  `[data-instrument="${next.id}"]`,
                )
                ?.focus();
            }}
          >
            <ControlIcon name={instrument.icon} />
          </Button>
        );
      })}
    </Group>
  );
}
