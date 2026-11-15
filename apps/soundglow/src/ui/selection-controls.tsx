// SPDX-License-Identifier: GPL-3.0-or-later
import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Accordion,
  Box,
  Button,
  Group,
  SimpleGrid,
  TextInput,
} from "@mantine/core";
import { createViewState } from "@ldayton/ui/view-state";
import { CommittedNumber } from "@ldayton/ui/committed-number";
type View = {
  active: boolean;
  start: number;
  end: number;
  duration: number;
  revision: number;
  editing: boolean;
  editRevision: number;
  busy: boolean;
};
type Actions = {
  fit(): void;
  clear(): void;
  begin(): void;
  cancel(): void;
  save(name: string): Promise<void>;
  bounds(start: number, end: number): boolean;
};
export function createSelectionControls() {
  const model = createViewState<View>({
    active: false,
    start: 0,
    end: 1,
    duration: 1,
    revision: 0,
    editing: false,
    editRevision: 0,
    busy: false,
  });
  let actions: Actions | undefined;
  function publish(next: Partial<View>) {
    const view = model.getSnapshot();
    if (
      Object.entries(next).some(
        ([key, value]) => view[key as keyof View] !== value,
      )
    )
      model.set({ ...view, ...next });
  }
  function Selection() {
    const view = useSyncExternalStore(model.subscribe, model.getSnapshot);
    const [name, setName] = useState("");
    const input = useRef<HTMLInputElement>(null),
      invoker = useRef<HTMLButtonElement>(null),
      previous = useRef(false);
    useLayoutEffect(() => {
      if (view.editing) {
        setName("");
        input.current?.focus({ preventScroll: true });
      }
    }, [view.editing, view.editRevision]);
    useLayoutEffect(() => {
      if (previous.current && !view.editing && view.active)
        invoker.current?.focus({ preventScroll: true });
      previous.current = view.editing;
    }, [view.editing, view.active]);
    return (
      <Box
        id="fileSelectionControls"
        role="group"
        aria-label="Selection controls"
        className="soundglow-selection"
        inert={!view.active}
        style={{ visibility: view.active ? "visible" : "hidden" }}
      >
        <Group
          className="selection-actions"
          gap="xs"
          justify="center"
          style={{ visibility: view.editing ? "hidden" : undefined }}
        >
          <Button
            id="waveformFitSelection"
            variant="default"
            disabled={!view.active}
            onClick={() => actions?.fit()}
          >
            Fit selection
          </Button>
          <Button
            ref={invoker}
            id="bookmarkSelection"
            variant="default"
            hidden={view.editing || !view.active}
            onClick={() => actions?.begin()}
          >
            Bookmark selection
          </Button>
          <Button
            id="clearAudioSelection"
            variant="default"
            hidden={!view.active}
            onClick={() => actions?.clear()}
          >
            Clear passage
          </Button>
        </Group>
        <form
          id="bookmarkForm"
          className="soundglow-bookmark-editor"
          hidden={!view.editing}
          onSubmit={(event) => {
            event.preventDefault();
            if (!view.busy) void actions?.save(name);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              actions?.cancel();
            }
          }}
        >
          <TextInput
            ref={input}
            id="bookmarkName"
            name="bookmarkName"
            aria-label="Bookmark name"
            placeholder="Bookmark name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            maxLength={80}
            required
            autoComplete="off"
            style={{ flex: 1, minWidth: 100 }}
          />
          <Button id="saveBookmark" type="submit" disabled={view.busy}>
            Save bookmark
          </Button>
          <Button
            id="cancelBookmark"
            variant="default"
            onClick={() => actions?.cancel()}
          >
            Cancel
          </Button>
        </form>
      </Box>
    );
  }
  function Options({ children }: { children: ReactNode }) {
    const view = useSyncExternalStore(model.subscribe, model.getSnapshot);
    return (
      <Accordion variant="default" className="file-more">
        <Accordion.Item value="playback">
          <Accordion.Control>Playback options</Accordion.Control>
          <Accordion.Panel>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {children}
              <Group align="flex-start" grow>
                <CommittedNumber
                  allowDecimal
                  id="fileLoopStart"
                  label="Passage start (seconds)"
                  value={view.start}
                  min={0}
                  max={view.duration}
                  step={0.0001}
                  reset={view.revision}
                  change={(value) => actions?.bounds(value, view.end) ?? false}
                />
                <CommittedNumber
                  allowDecimal
                  id="fileLoopEnd"
                  label="Passage end (seconds)"
                  value={view.end}
                  min={0}
                  max={view.duration}
                  step={0.0001}
                  reset={view.revision}
                  change={(value) =>
                    actions?.bounds(view.start, value) ?? false
                  }
                />
              </Group>
            </SimpleGrid>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    );
  }
  return {
    Selection,
    Options,
    connect(next: Actions) {
      actions = next;
    },
    publish,
    open() {
      const view = model.getSnapshot();
      publish({ editing: true, editRevision: view.editRevision + 1 });
    },
    close() {
      publish({ editing: false });
    },
  };
}
