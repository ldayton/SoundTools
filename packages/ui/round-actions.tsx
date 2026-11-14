import { PracticeActions } from "./practice-actions";
import type { ReactNode } from "react";
import { Button } from "@mantine/core";
/** Shared flashcard/theory round actions, not a playback state machine. */
export function RoundActions({
  nextVisible,
  next,
  restart,
  nextId,
  restartId,
  nextClass,
  restartClass,
  children,
}: {
  nextVisible: boolean;
  next(): void;
  restart(): void;
  nextId?: string;
  restartId?: string;
  nextClass?: string;
  restartClass?: string;
  children?: ReactNode;
}) {
  return (
    <PracticeActions>
      <Button
        id={nextId}
        className={nextClass}
        hidden={!nextVisible}
        onClick={next}
      >
        Next question →
      </Button>
      <Button
        id={restartId}
        className={restartClass}
        variant="default"
        onClick={restart}
      >
        Start again
      </Button>
      {children}
    </PracticeActions>
  );
}
export function ContinueRound({
  onClick,
  id,
  className,
}: {
  onClick(): void;
  id?: string;
  className?: string;
}) {
  return (
    <Button id={id} className={className} onClick={onClick}>
      Keep going →
    </Button>
  );
}
