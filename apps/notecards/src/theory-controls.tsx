import { RoundActions, ContinueRound } from "@ldayton/ui/round-actions";
import { useSyncExternalStore } from "react";
import { Button, Group, Kbd } from "@mantine/core";
import { createViewState } from "./view-state";
import { PracticePianoToggle } from "./piano-presentation";
export type TheoryChoice = {
  value: string;
  number: string;
  label: string;
  shortcut?: string;
};
export const theoryControlsState = createViewState<{
  next: boolean;
  accepting: boolean;
  choices: TheoryChoice[];
}>;
export type TheoryControlsState = ReturnType<typeof theoryControlsState>;
export function TheoryAnswers({
  model,
  answer,
}: {
  model: TheoryControlsState;
  answer(value: string): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <Group gap="xs" justify="center" className="soundtools-ui">
      {state.choices.map((choice) => (
        <Button
          key={choice.value}
          variant="default"
          disabled={!state.accepting}
          data-answer={choice.value}
          data-number={choice.number}
          data-key={choice.shortcut}
          title={
            choice.shortcut
              ? `Press ${choice.shortcut === "M" ? "Shift + M" : choice.shortcut}`
              : undefined
          }
          onClick={() => answer(choice.value)}
          rightSection={
            choice.shortcut ? (
              <Kbd aria-hidden="true">{choice.shortcut}</Kbd>
            ) : undefined
          }
        >
          {choice.label}
        </Button>
      ))}
    </Group>
  );
}
export function TheoryControls({
  model,
  panelId,
  next,
  restart,
}: {
  model: TheoryControlsState;
  panelId: string;
  next(): void;
  restart(): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <RoundActions
      nextVisible={state.next}
      next={next}
      restart={restart}
      nextClass="theory-next"
      restartClass="theory-restart"
    >
      <PracticePianoToggle panelId={panelId} />
    </RoundActions>
  );
}
export function TheoryContinue({ next }: { next(): void }) {
  return (
    <ContinueRound className="theory-continue soundtools-ui" onClick={next} />
  );
}
