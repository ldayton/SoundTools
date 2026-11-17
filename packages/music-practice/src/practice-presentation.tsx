import { useSyncExternalStore } from "react";
import {
  Alert,
  Group,
  Stack,
  Text,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { ContinueRound } from "@ldayton/ui/round-actions";
import { createViewState } from "./view-state";

type Presentation = {
  context: string;
  count: string;
  title: string;
  value: number;
  max: number;
  feedback: string;
  kind: string;
  summary: boolean;
  result: string;
  suggestion: string;
  rangeHint: string;
};
export function practicePresentation(initial: Partial<Presentation> = {}) {
  const model = createViewState<Presentation>({
    context: "",
    count: "",
    title: "",
    value: 0,
    max: 1,
    feedback: "",
    kind: "",
    summary: false,
    result: "",
    suggestion: "",
    rangeHint: "",
    ...initial,
  });
  return {
    ...model,
    set(patch: Partial<Presentation>) {
      model.set({ ...model.getSnapshot(), ...patch });
    },
  };
}
export type PresentationModel = ReturnType<typeof practicePresentation>;
export type PresentationKind =
  "flashcard" | "theory" | "hymn" | "pattern" | "rhythm";
export function PracticeHeader({
  model,
  kind,
}: {
  model: PresentationModel;
  kind: PresentationKind;
}) {
  const s = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <>
      <Group
        justify="space-between"
        gap="xs"
        hidden={!s.context}
        className={kind === "flashcard" ? "card-top" : "sequence-top"}
      >
        <Text
          component="span"
          size="xs"
          id={kind === "flashcard" ? "context" : undefined}
          className={kind === "theory" ? "theory-context" : undefined}
        >
          {s.context}
        </Text>
      </Group>
    </>
  );
}
export function PracticeCount({
  model,
  kind,
}: {
  model: PresentationModel;
  kind: PresentationKind;
}) {
  const s = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <Text
      component="span"
      size="sm"
      c="dimmed"
      id={kind === "flashcard" ? "counter" : undefined}
      className={`${kind}-count session-count`}
      aria-label="Practice position"
      data-answered={s.value}
      data-total={s.max}
    >
      {s.count}
    </Text>
  );
}
/** Keep position accessible without reserving a row above the score. */
export function HymnStatus({ model }: { model: PresentationModel }) {
  const s = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <>
      <VisuallyHidden className="hymn-count">{s.count}</VisuallyHidden>
      {s.rangeHint && (
        <Text className="hymn-range-hint" size="xs" role="status">
          {s.rangeHint}
        </Text>
      )}
    </>
  );
}
export function PracticeFeedback({
  model,
  kind,
  errorsOnly = false,
}: {
  model: PresentationModel;
  kind: PresentationKind;
  errorsOnly?: boolean;
}) {
  const s = useSyncExternalStore(model.subscribe, model.getSnapshot);
  if (errorsOnly && s.kind !== "error") return null;
  if (!["wrong", "incorrect", "correct", "error"].includes(s.kind)) {
    return (
      <Text
        id={kind === "flashcard" ? "feedback" : undefined}
        className={`${kind === "flashcard" ? "practice-feedback" : "sequence-feedback"} ${s.kind}`}
        data-kind={s.kind || undefined}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        size="sm"
        p={kind === "hymn" ? "xs" : 0}
        mb={kind === "hymn" ? "sm" : 0}
        ta="center"
      >
        {s.feedback}
      </Text>
    );
  }
  return (
    <Alert
      id={kind === "flashcard" ? "feedback" : undefined}
      className={`${kind === "flashcard" ? "practice-feedback" : "sequence-feedback"} ${s.kind}`}
      data-kind={s.kind || undefined}
      color={
        ["wrong", "incorrect", "error"].includes(s.kind)
          ? "red"
          : s.kind === "correct"
            ? "green"
            : undefined
      }
      variant="light"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      p="xs"
      mb={kind === "hymn" ? "sm" : 0}
      ta="center"
    >
      {s.feedback}
    </Alert>
  );
}
export function PracticeSummary({
  model,
  kind,
  next,
}: {
  model: PresentationModel;
  kind: PresentationKind;
  next(): void;
}) {
  const s = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <Stack
      id={kind === "flashcard" ? "summary" : undefined}
      className={`${kind}-summary`}
      hidden={!s.summary}
      align="center"
      gap="sm"
      p="md"
    >
      <Title order={2} size="h3">
        Round complete
      </Title>
      <Text id={kind === "flashcard" ? "result" : undefined}>{s.result}</Text>
      <ContinueRound
        id={kind === "flashcard" ? "continue" : undefined}
        className={kind === "theory" ? "theory-continue" : undefined}
        onClick={next}
      />
      <Text
        id={kind === "flashcard" ? "suggestion" : undefined}
        className={`${kind}-suggestion`}
        size="sm"
        c="dimmed"
      >
        {s.suggestion}
      </Text>
    </Stack>
  );
}
