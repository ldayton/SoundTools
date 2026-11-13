import { useSyncExternalStore } from "react";
import {
  Accordion,
  Checkbox,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { KEYS, ROUND_LENGTHS, name } from "./model";
import {
  TASKS,
  ordinal,
  scaleNotes,
  type TheoryKind,
  type TheoryTask,
  type TheorySettings,
  type Quality,
} from "./theory-model";
import { createViewState } from "./view-state";
import { RetainedContent } from "./retained-content";
export type TheoryOptionsSnapshot = {
  kind: TheoryKind;
  task: TheoryTask;
  settings: TheorySettings;
};
export const theoryOptionsState = createViewState<TheoryOptionsSnapshot>;
export type TheoryOptionsState = ReturnType<typeof theoryOptionsState>;
const degrees = [1, 2, 3, 4, 5, 6, 7];
const intervals = [2, 3, 4, 5, 6, 7, 8];
const basicQualities = ["major", "minor", "perfect"] as const;
const advancedQualities = ["augmented", "diminished"] as const;
export function TheoryOptions({
  model,
  ranges,
  change,
  taskChanged,
}: {
  model: TheoryOptionsState;
  ranges: HTMLElement;
  change(patch: Partial<TheorySettings>): void;
  taskChanged(task: TheoryTask): void;
}) {
  const {
    kind,
    task,
    settings: s,
  } = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const scales = kind === "scales",
    identifying = task.startsWith("name-");
  const namingQuality =
    task === "name-quality" ||
    (task === "build-interval" && s.quality !== "number");
  const selectedKeys = s.keys.map(
    (k) =>
      `${name(scaleNotes(k, s.mode, 4)[0])} ${s.mode === "minor" ? "minor" : "major"}`,
  );
  const keySummary = `Keys · ${selectedKeys.length <= 3 ? selectedKeys.join(", ") : selectedKeys.length + " selected"}`;
  const id = (field: string) => `${kind}-option-${field}`;
  return (
    <Stack className="soundtools-ui">
      <NativeSelect
        id={id("task")}
        data-field="task"
        label="Task"
        value={task}
        data={TASKS[kind].map(([value, label]) => ({ value, label }))}
        onChange={(e) => taskChanged(e.currentTarget.value as TheoryTask)}
      />
      <SimpleGrid cols={2}>
        <NativeSelect
          id={id("roundLength")}
          data-field="roundLength"
          label="Cards per round"
          value={String(s.roundLength)}
          data={ROUND_LENGTHS.map((n) => String(n))}
          onChange={(e) =>
            change({
              roundLength: Number(
                e.currentTarget.value,
              ) as TheorySettings["roundLength"],
            })
          }
        />
        <NativeSelect
          id={id("clef")}
          data-field="clef"
          label="Staff"
          value={s.clef}
          data={[
            { value: "treble", label: "Treble" },
            { value: "bass", label: "Bass" },
          ]}
          onChange={(e) =>
            change({ clef: e.currentTarget.value as TheorySettings["clef"] })
          }
        />
      </SimpleGrid>
      {scales && (
        <NativeSelect
          id={id("mode")}
          data-field="mode"
          label="Scale"
          value={s.mode}
          data={[
            { value: "major", label: "Major" },
            { value: "minor", label: "Natural minor" },
          ]}
          onChange={(e) =>
            change({ mode: e.currentTarget.value as TheorySettings["mode"] })
          }
        />
      )}
      {task === "build-interval" && (
        <>
          <NativeSelect
            id={id("quality")}
            data-field="quality"
            label="Build"
            value={s.quality}
            data={[
              { value: "number", label: "Within a key" },
              { value: "basic", label: "Named interval" },
            ]}
            onChange={(e) =>
              change({
                quality: e.currentTarget.value as TheorySettings["quality"],
              })
            }
          />
          {s.quality === "number" && (
            <NativeSelect
              id={id("intervalKey")}
              data-field="intervalKey"
              label="Key"
              value={s.intervalKey}
              data={KEYS.map((k) => ({
                value: k.id,
                label: k.label.split(" ·")[0],
              }))}
              onChange={(e) => change({ intervalKey: e.currentTarget.value })}
            />
          )}
        </>
      )}
      {(scales
        ? task === "build-scale"
        : !identifying || s.presentation !== "together") && (
        <NativeSelect
          id={id("direction")}
          data-field="direction"
          label="Direction"
          value={s.direction}
          data={[
            { value: "up", label: "Rising" },
            { value: "down", label: "Falling" },
            { value: "both", label: "Both" },
          ]}
          onChange={(e) =>
            change({
              direction: e.currentTarget.value as TheorySettings["direction"],
            })
          }
        />
      )}
      {!scales && identifying && (
        <NativeSelect
          id={id("presentation")}
          data-field="presentation"
          label="Show notes"
          value={s.presentation}
          data={[
            { value: "successive", label: "In sequence" },
            { value: "together", label: "Together" },
          ]}
          onChange={(e) =>
            change({
              presentation: e.currentTarget
                .value as TheorySettings["presentation"],
            })
          }
        />
      )}
      {!scales && !(task === "build-interval" && s.quality === "number") && (
        <NativeSelect
          id={id("accidentals")}
          data-field="accidentals"
          label="Accidentals"
          value={s.accidentals}
          data={[
            { value: "naturals", label: "Natural notes" },
            { value: "simple", label: "Sharps & flats" },
          ]}
          onChange={(e) =>
            change({
              accidentals: e.currentTarget
                .value as TheorySettings["accidentals"],
            })
          }
        />
      )}
      {scales ? (
        <>
          {task !== "build-scale" && (
            <Checkbox.Group
              id={id("degrees")}
              label="Degrees"
              value={s.degrees.map(String)}
              onChange={(v) => change({ degrees: v.map(Number) })}
            >
              <SimpleGrid cols={4} mt="xs">
                {degrees.map((n) => (
                  <Checkbox
                    key={n}
                    id={id(`degree-${n}`)}
                    value={String(n)}
                    label={String(n)}
                    disabled={s.degrees.length === 1 && s.degrees.includes(n)}
                  />
                ))}
              </SimpleGrid>
            </Checkbox.Group>
          )}
          <Accordion id={id("keys-disclosure")} order={3}>
            <Accordion.Item value="keys">
              <Accordion.Control>{keySummary}</Accordion.Control>
              <Accordion.Panel>
                <Checkbox.Group
                  id={id("keys")}
                  label="Keys"
                  value={s.keys}
                  onChange={(v) => change({ keys: v })}
                >
                  <SimpleGrid cols={2} mt="xs">
                    {KEYS.map((k) => (
                      <Checkbox
                        key={k.id}
                        id={id(`key-${k.id}`)}
                        value={k.id}
                        label={`${name(scaleNotes(k.id, s.mode, 4)[0])} ${s.mode === "minor" ? "minor" : "major"}`}
                        disabled={s.keys.length === 1 && s.keys.includes(k.id)}
                      />
                    ))}
                  </SimpleGrid>
                </Checkbox.Group>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </>
      ) : (
        <>
          <Checkbox.Group
            id={id("intervals")}
            label="Intervals"
            value={s.intervals.map(String)}
            onChange={(v) => change({ intervals: v.map(Number) })}
          >
            <SimpleGrid cols={3} mt="xs">
              {intervals.map((n) => (
                <Checkbox
                  key={n}
                  id={id(`interval-${n}`)}
                  value={String(n)}
                  label={ordinal(n)}
                  disabled={s.intervals.length === 1 && s.intervals.includes(n)}
                />
              ))}
            </SimpleGrid>
          </Checkbox.Group>
          {namingQuality && (
            <Checkbox.Group
              id={id("qualities")}
              label="Qualities"
              value={s.qualities}
              onChange={(v) => change({ qualities: v as Quality[] })}
            >
              <Stack gap="xs" mt="xs">
                {basicQualities
                  .filter((q) =>
                    q === "perfect"
                      ? s.intervals.some((n) => [4, 5, 8].includes(n))
                      : !s.intervals.every((n) => [4, 5, 8].includes(n)),
                  )
                  .map((q) => (
                    <Checkbox
                      key={q}
                      id={id(`quality-${q}`)}
                      value={q}
                      label={q[0].toUpperCase() + q.slice(1)}
                      disabled={
                        s.qualities.length === 1 && s.qualities.includes(q)
                      }
                    />
                  ))}
                <Accordion id={id("advanced-disclosure")} order={3}>
                  <Accordion.Item value="advanced">
                    <Accordion.Control>Advanced qualities</Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="xs">
                        {advancedQualities.map((q) => (
                          <Checkbox
                            key={q}
                            id={id(`quality-${q}`)}
                            value={q}
                            label={q[0].toUpperCase() + q.slice(1)}
                            disabled={
                              s.qualities.length === 1 &&
                              s.qualities.includes(q)
                            }
                          />
                        ))}
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
              </Stack>
            </Checkbox.Group>
          )}
          <RetainedContent element={ranges} />
        </>
      )}
      <Accordion id={id("example-disclosure")} order={3}>
        <Accordion.Item value="example">
          <Accordion.Control>Example</Accordion.Control>
          <Accordion.Panel>
            <Text size="sm">
              {scales
                ? "In C major, C is degree 1. Count C–D–E to find degree 3. Every major scale uses whole–whole–half–whole–whole–whole–half steps."
                : "Count both notes: C–D is a second; C–D–E is a third. Interval numbers count letter names. A unison repeats the same note; practice starts with seconds. Major, minor and perfect describe their semitone distances. Full interval naming starts with major versus minor thirds."}
            </Text>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
