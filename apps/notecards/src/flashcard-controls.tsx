import { useSyncExternalStore } from "react";
import { Button, Group, Stack } from "@mantine/core";
import { createViewState } from "./view-state";
import { PracticePianoToggle } from "./piano-presentation";
import type { Letter, Modifier } from "./model";
export const flashcardControlsState = createViewState<{
  enabled: boolean;
  modifier: Modifier;
  next: boolean;
}>;
export type FlashcardControlsState = ReturnType<typeof flashcardControlsState>;
export function FlashcardAnswers({
  model,
  answer,
  modify,
}: {
  model: FlashcardControlsState;
  answer(letter: Letter): void;
  modify(value: Modifier): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <Stack gap="sm" className="soundtools-ui">
      <Group
        gap="xs"
        justify="center"
        role="group"
        aria-label="Accidental"
        className="modifiers"
      >
        {([-1, 0, 1] as const).map((value) => (
          <Button
            key={value}
            variant={state.modifier === value ? "light" : "default"}
            size="md"
            h={48}
            px="sm"
            aria-label={
              value === -1 ? "Flat" : value === 1 ? "Sharp" : "Natural"
            }
            aria-pressed={state.modifier === value}
            disabled={!state.enabled}
            data-mod={value}
            onClick={() => modify(value)}
          >
            {value === -1 ? "♭" : value === 1 ? "♯" : "♮"}
          </Button>
        ))}
      </Group>
      <Group
        gap="xs"
        justify="center"
        role="group"
        aria-label="Note letter"
        className="letters"
      >
        {"CDEFGAB".split("").map((letter) => (
          <Button
            key={letter}
            size="md"
            h={48}
            px="sm"
            variant="default"
            disabled={!state.enabled}
            data-letter={letter}
            onClick={() => answer(letter as Letter)}
          >
            {letter}
          </Button>
        ))}
      </Group>
    </Stack>
  );
}
export function FlashcardControls({
  model,
  panelId,
  next,
  restart,
}: {
  model: FlashcardControlsState;
  panelId: string;
  next(): void;
  restart(): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <Group gap="xs" className="soundtools-ui">
      <Button id="feedback-next" hidden={!state.next} onClick={next}>
        Next question →
      </Button>
      <Button id="restart-round" variant="default" onClick={restart}>
        Start again
      </Button>
      <PracticePianoToggle panelId={panelId} />
    </Group>
  );
}
export function FlashcardContinue({ next }: { next(): void }) {
  return (
    <Button id="continue" className="soundtools-ui" onClick={next}>
      Keep going →
    </Button>
  );
}
