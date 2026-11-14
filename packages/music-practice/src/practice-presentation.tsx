import { useSyncExternalStore } from "react";
import { Alert, Group, Progress, Stack, Text, Title } from "@mantine/core";
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
  scrollHint: boolean;
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
    scrollHint: false,
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
        p={kind === "flashcard" ? "md" : undefined}
        pb={kind === "flashcard" ? "sm" : undefined}
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
        <Text
          component="span"
          size="xs"
          id={kind === "flashcard" ? "counter" : undefined}
          className={`${kind}-count`}
        >
          {s.count}
        </Text>
        {kind === "hymn" && (
          <>
            <Text
              component="span"
              size="xs"
              id="hymn-scroll-hint"
              className="hymn-scroll-hint"
              hidden={!s.scrollHint}
            >
              Scroll for more ↕
            </Text>
            <Text
              component="span"
              size="xs"
              className="hymn-range-hint"
              hidden={!s.rangeHint}
            >
              {s.rangeHint}
            </Text>
          </>
        )}
      </Group>
      {s.title && kind === "hymn" && (
        <Title order={2} size="h3" mt="sm" mb="sm" className="sequence-title">
          {s.title}
        </Title>
      )}
    </>
  );
}
export function PracticeProgress({
  model,
  kind,
}: {
  model: PresentationModel;
  kind: PresentationKind;
}) {
  const s = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <Progress.Root
      id={kind === "flashcard" ? "progress" : undefined}
      className={`${kind}-progress`}
      role="progressbar"
      aria-label={
        kind === "hymn"
          ? "Hymn progress"
          : kind === "pattern"
            ? "Pattern progress"
            : "Session progress"
      }
      aria-valuemin={0}
      aria-valuemax={s.max}
      aria-valuenow={s.value}
      size="xs"
      mb="sm"
    >
      <Progress.Section
        value={s.max > 0 ? (100 * s.value) / s.max : 0}
        withAria={false}
      />
    </Progress.Root>
  );
}
export function PracticeFeedback({
  model,
  kind,
}: {
  model: PresentationModel;
  kind: PresentationKind;
}) {
  const s = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <Alert
      id={kind === "flashcard" ? "feedback" : undefined}
      className={`${kind === "flashcard" ? "practice-feedback" : "sequence-feedback"} ${s.kind}`}
      data-kind={s.kind || undefined}
      color={
        ["wrong", "incorrect"].includes(s.kind)
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
      mb="sm"
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
