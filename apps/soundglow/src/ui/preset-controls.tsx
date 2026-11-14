// SPDX-License-Identifier: GPL-3.0-or-later
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Modal,
  NativeSelect,
  Notification,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { flushSync } from "react-dom";
import { createViewState } from "@ldayton/ui/view-state";

type Choice = { value: string; label: string };
type Editor = {
  opened: boolean;
  name: string;
  title: string;
  canDelete: boolean;
};
type Handlers = {
  choose(id: string): void;
  open(): void;
  save(name: string): boolean;
  remove(): void;
  cancel(): void;
  dismiss(): void;
};
export type PresetIds = {
  dialog: string;
  title: string;
  form: string;
  name: string;
  status: string;
  cancel: string;
  confirm: string;
  remove: string;
  invoker: string;
};
export function PresetDialog({
  editor,
  status,
  ids,
  save,
  remove,
  close,
}: {
  editor: Editor;
  status: string;
  ids: PresetIds;
  save(name: string): boolean;
  remove(): void;
  close(): void;
}) {
  const [name, setName] = useState(editor.name);
  const opened = useRef(editor.opened);
  opened.current = editor.opened;
  useLayoutEffect(() => {
    if (editor.opened) setName(editor.name);
  }, [editor.opened, editor.name]);
  return (
    <Modal.Root
      opened={editor.opened}
      onClose={close}
      centered
      size="sm"
      returnFocus={false}
      closeOnEscape={false}
      onExitTransitionEnd={() => {
        if (opened.current) return;
        const target = document.getElementById(ids.invoker);
        if (target?.getClientRects().length && !target.closest("[inert]"))
          target.focus({ preventScroll: true });
        else
          [...document.querySelectorAll<HTMLElement>("#openSettings,#settings")]
            .find((node) => node.getClientRects().length)
            ?.focus({ preventScroll: true });
      }}
    >
      <Modal.Overlay />
      <Modal.Content id={ids.dialog} className="soundtools-ui" onKeyDownCapture={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}>
        <Modal.Header>
          <Modal.Title id={ids.title}>{editor.title}</Modal.Title>
          <Modal.CloseButton aria-label="Close preset editor" />
        </Modal.Header>
        <Modal.Body>
          <form
            id={ids.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (editor.opened) save(name);
            }}
          >
            <Stack gap="md">
              <TextInput
                id={ids.name}
                label="Preset name"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                maxLength={60}
                required
                autoComplete="off"
                data-autofocus
              />
              <Text id={ids.status} role="status" size="sm" c="red">
                {status}
              </Text>
              <Group justify="flex-end" gap="sm">
                <Button
                  id={ids.remove}
                  color="red"
                  variant="subtle"
                  hidden={!editor.canDelete}
                  disabled={!editor.opened}
                  onClick={remove}
                >
                  Delete
                </Button>
                <Button
                  id={ids.cancel}
                  variant="default"
                  disabled={!editor.opened}
                  onClick={close}
                >
                  Cancel
                </Button>
                <Button
                  id={ids.confirm}
                  type="submit"
                  disabled={!editor.opened}
                >
                  {editor.canDelete ? "Rename" : "Create"}
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
const spectrogramIds: PresetIds = {
  dialog: "presetDialog",
  title: "presetDialogTitle",
  form: "savePresetForm",
  name: "presetName",
  status: "presetStatus",
  cancel: "cancelPresetEdit",
  confirm: "confirmPresetName",
  remove: "deletePreset",
  invoker: "editPresets",
};
export function createSpectrogramPresets() {
  const model = createViewState({
    selected: "soundglow",
    choices: [
      { value: "soundglow", label: "Soundglow" },
      { value: "praat", label: "Praat" },
      { value: "voice", label: "Voice Tools" },
    ] as Choice[],
    editor: {
      opened: false,
      name: "",
      title: "Name preset",
      canDelete: false,
    } as Editor,
    status: "",
    toastVisible: false,
  });
  let handlers: Handlers | undefined;
  function patch(next: Partial<ReturnType<typeof model.getSnapshot>>) {
    model.set({ ...model.getSnapshot(), ...next });
  }
  function Controls() {
    const view = useSyncExternalStore(model.subscribe, model.getSnapshot);
    return (
      <>
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <NativeSelect
            id="preset"
            label="Preset"
            value={view.selected}
            onChange={(event) => handlers?.choose(event.currentTarget.value)}
            style={{ flex: 1, minWidth: 0 }}
          >
            {view.choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
            <option
              id="unnamedPreset"
              value="custom"
              disabled
              hidden={view.selected !== "custom"}
            >
              Unnamed Preset*
            </option>
          </NativeSelect>
          <ActionIcon
            id="editPresets"
            variant="default"
            size="input-sm"
            aria-label="Edit presets"
            title="Edit presets"
            aria-haspopup="dialog"
            aria-expanded={view.editor.opened}
            aria-controls="presetDialog"
            onClick={() => handlers?.open()}
          >
            ✎
          </ActionIcon>
        </Group>
        <PresetDialog
          editor={view.editor}
          status={view.status}
          ids={spectrogramIds}
          save={(name) => handlers?.save(name) ?? false}
          remove={() => handlers?.remove()}
          close={() => handlers?.cancel()}
        />
        <Box
          id="presetToast"
          className="soundtools-ui soundglow-toast"
          hidden={!view.toastVisible || view.editor.opened || !view.status}
        >
          <Notification onClose={() => handlers?.dismiss()}>
            <span id={!view.editor.opened ? "presetStatus" : undefined}>{view.status}</span>
          </Notification>
        </Box>
      </>
    );
  }
  return {
    Controls,
    connect(next: Handlers) {
      handlers = next;
    },
    publish(selected: string, choices: Choice[]) {
      patch({ selected, choices });
    },
    isOpen() {
      return model.getSnapshot().editor.opened;
    },
    open(editor: Omit<Editor, "opened">) {
      flushSync(() => patch({ editor: { ...editor, opened: true } }));
    },
    close() {
      const view = model.getSnapshot();
      if (view.editor.opened)
        flushSync(() => patch({ editor: { ...view.editor, opened: false } }));
    },
    status(status: string) {
      patch({ status, toastVisible: !!status });
    },
    hideToast() {
      patch({ toastVisible: false });
    },
  };
}
