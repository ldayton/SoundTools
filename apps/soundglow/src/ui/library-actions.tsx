// SPDX-License-Identifier: GPL-3.0-or-later
import {
  StrictMode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPortal, flushSync } from "react-dom";
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { SoundToolsProvider } from "@ldayton/ui";
import { createViewState } from "@ldayton/ui/view-state";
import "./library.css";

type Kind = "file" | "bookmark";
type Target = { kind: Kind; id: string };
type Row = Target & {
  name: string;
  detail: string;
  title: string;
  selected?: boolean;
};
type Item = { name: string; deleteDescription: string; maxNameLength: number };
type Host = {
  find(kind: Kind, id: string): Item | null | undefined;
  open(kind: Kind, id: string): void;
  rename(kind: Kind, id: string, name: string): Promise<void>;
  remove(kind: Kind, id: string): Promise<boolean>;
};
type Edit = Target & { action: "rename" | "delete"; item: Item };
type View = {
  files: Row[];
  bookmarks: Row[];
  menu: string | null;
  edit: Edit | null;
  dialogOpen: boolean;
};
const key = (target: Target) => `${target.kind}:${target.id}`;

/** A bounded React UI. AudioLibrary keeps ownership of storage, selection and playback. */
class LibraryActions {
  readonly model = createViewState<View>({
    files: [],
    bookmarks: [],
    menu: null,
    edit: null,
    dialogOpen: false,
  });
  private root: Root;
  private mount = document.createElement("div");
  private disposed = false;
  private events = new AbortController();
  constructor(
    readonly element: HTMLElement,
    readonly host: Host,
  ) {
    this.mount.id = "soundglow-ui-root";
    document.body.append(this.mount);
    this.root = createRoot(this.mount, {
      onUncaughtError: (error) =>
        window.SoundglowDiagnostics?.capture(error, "library.ui_failed"),
    });
    flushSync(() =>
      this.root.render(
        <StrictMode>
          <SoundToolsProvider
            colorScheme="dark"
            primaryColor="orange"
            pageColor="#080b10"
          >
            <LibraryView controller={this} />
          </SoundToolsProvider>
        </StrictMode>,
      ),
    );
    window.addEventListener(
      "pagehide",
      (event) => {
        if (event.persisted) this.patch({ menu: null, dialogOpen: false });
        else this.dispose();
      },
      { signal: this.events.signal },
    );
  }
  patch(patch: Partial<View>) {
    if (!this.disposed)
      this.model.set({ ...this.model.getSnapshot(), ...patch });
  }
  renderList(kind: Kind, rows: Row[]) {
    flushSync(() =>
      this.patch({
        [kind === "file" ? "files" : "bookmarks"]: rows,
        menu: null,
      }),
    );
  }
  closeMenu() {
    this.patch({ menu: null });
  }
  edit(target: Target, action: Edit["action"]) {
    const item = this.host.find(target.kind, target.id);
    if (item)
      this.patch({
        menu: null,
        edit: {
          ...target,
          action,
          item: {
            name: item.name,
            deleteDescription: item.deleteDescription,
            maxNameLength: item.maxNameLength,
          },
        },
        dialogOpen: true,
      });
  }
  focusItem(target: Target) {
    if (this.disposed) return;
    const row = [
      ...this.element.querySelectorAll<HTMLElement>("[data-library-kind]"),
    ].find(
      (row) =>
        row.dataset.libraryKind === target.kind &&
        row.dataset.libraryId === target.id,
    );
    (
      row?.querySelector<HTMLElement>("[data-library-menu]") ||
      document.getElementById("importAudio")
    )?.focus();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.events.abort();
    this.root.unmount();
    this.mount.remove();
  }
}
function LibraryRow({
  row,
  controller,
  menu,
}: {
  row: Row;
  controller: LibraryActions;
  menu: string | null;
}) {
  const more = useRef<HTMLButtonElement>(null);
  const contextKey = key(row) + ":context",
    buttonKey = key(row) + ":button";
  const contextOpen = menu === contextKey,
    buttonOpen = menu === buttonKey;
  const opened = contextOpen || buttonOpen;
  function toggle(source: string, open: boolean) {
    if (open) controller.patch({ menu: source });
    else if (controller.model.getSnapshot().menu === source)
      controller.closeMenu();
  }
  useEffect(() => {
    if (!opened) return;
    const events = new AbortController();
    const close = () => controller.closeMenu();
    window.addEventListener("resize", close, { signal: events.signal });
    window.addEventListener("blur", close, { signal: events.signal });
    document.addEventListener("scroll", close, {
      capture: true,
      signal: events.signal,
    });
    return () => events.abort();
  }, [opened, controller]);
  // Cursor and button menus keep separate floating references and share their actions.
  return (
    <Menu
      opened={contextOpen}
      onChange={(open) => toggle(contextKey, open)}
      position="bottom-start"
      width={180}
      withinPortal
      returnFocus
      withInitialFocusPlaceholder={false}
    >
      <Menu.ContextMenu>
        <div
          className="library-row soundtools-ui"
          data-library-kind={row.kind}
          data-library-id={row.id}
          onContextMenu={() => more.current?.focus({ preventScroll: true })}
          onKeyDown={(event) => {
            if (
              event.key === "ContextMenu" ||
              (event.shiftKey && event.key === "F10")
            ) {
              event.preventDefault();
              event.stopPropagation();
              more.current?.click();
            }
          }}
        >
          <UnstyledButton
            className="library-item"
            {...(row.kind === "file"
              ? { "data-file": row.id, "aria-pressed": !!row.selected }
              : { "data-bookmark": row.id })}
            title={row.title}
            onClick={() => controller.host.open(row.kind, row.id)}
          >
            <span className="library-item-name">{row.name}</span>
            <small>{row.detail}</small>
          </UnstyledButton>
          <Menu
            opened={buttonOpen}
            onChange={(open) => toggle(buttonKey, open)}
            position="bottom-start"
            width={180}
            withInitialFocusPlaceholder={false}
          >
            <Menu.Target>
              <ActionIcon
                ref={more}
                className="library-more"
                data-library-menu
                variant="subtle"
                aria-label={`Actions for ${row.kind} ${row.name}`}
                title="More actions"
              >
                ⋯
              </ActionIcon>
            </Menu.Target>
            <LibraryMenuItems
              row={row}
              controller={controller}
              opened={buttonOpen}
            />
          </Menu>
        </div>
      </Menu.ContextMenu>
      <LibraryMenuItems
        row={row}
        controller={controller}
        opened={contextOpen}
      />
    </Menu>
  );
}
function LibraryMenuItems({
  row,
  controller,
  opened,
}: {
  row: Row;
  controller: LibraryActions;
  opened: boolean;
}) {
  return (
    <Menu.Dropdown
      id={opened ? "libraryItemMenu" : undefined}
      aria-hidden={!opened}
      className="soundtools-ui"
      aria-label="Library item actions"
    >
      <Menu.Item onClick={() => controller.edit(row, "rename")}>
        Rename…
      </Menu.Item>
      <Menu.Item color="red" onClick={() => controller.edit(row, "delete")}>
        Delete…
      </Menu.Item>
    </Menu.Dropdown>
  );
}
function LibraryDialog({
  controller,
  edit,
  opened,
}: {
  controller: LibraryActions;
  edit: Edit | null;
  opened: boolean;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    setName(edit?.item.name || "");
    setError("");
    setNameError("");
  }, [edit]);
  const rename = edit?.action === "rename";
  const close = () => {
    if (!busy) controller.patch({ dialogOpen: false });
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !edit) return;
    const value = name.trim();
    if (rename && (!value || value.length > edit.item.maxNameLength)) {
      setNameError(
        !value
          ? "Enter a name."
          : `Use ${edit.item.maxNameLength} characters or fewer.`,
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (rename) await controller.host.rename(edit.kind, edit.id, value);
      else if (!(await controller.host.remove(edit.kind, edit.id)))
        throw Error("Removal failed");
      controller.patch({ dialogOpen: false });
    } catch {
      if (mounted.current)
        setError(`Could not ${edit.action} this ${edit.kind}. Please retry.`);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Modal.Root
      opened={opened}
      onClose={close}
      centered
      size="sm"
      returnFocus={false}
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
      onExitTransitionEnd={() => {
        if (!controller.model.getSnapshot().dialogOpen && edit) {
          controller.focusItem(edit);
          controller.patch({ edit: null });
        }
      }}
    >
      <Modal.Overlay />
      <Modal.Content id="libraryItemDialog" className="soundtools-ui">
        <Modal.Header>
          <Modal.Title>
            {rename ? "Rename" : "Delete"} {edit?.kind}
          </Modal.Title>
          <Modal.CloseButton disabled={busy} aria-label="Close dialog" />
        </Modal.Header>
        <Modal.Body>
          <form id="libraryItemForm" onSubmit={submit}>
            <Stack gap="md">
              <Text
                id="libraryItemDescription"
                size="sm"
                c="dimmed"
                style={{ overflowWrap: "anywhere" }}
              >
                {rename ? edit?.item.name : edit?.item.deleteDescription}
              </Text>
              {rename && (
                <TextInput
                  id="libraryItemName"
                  label="Name"
                  value={name}
                  onChange={(event) => {
                    setName(event.currentTarget.value);
                    setNameError("");
                  }}
                  maxLength={edit?.item.maxNameLength}
                  error={nameError || undefined}
                  autoComplete="off"
                  data-autofocus
                  disabled={busy}
                />
              )}
              {error && (
                <Text id="libraryItemError" c="red" size="sm" role="alert">
                  {error}
                </Text>
              )}
              <Group justify="flex-end" gap="sm">
                <Button
                  id="libraryItemCancel"
                  variant="default"
                  onClick={close}
                  disabled={busy}
                  data-autofocus={!rename || undefined}
                >
                  Cancel
                </Button>
                <Button
                  id="libraryItemConfirm"
                  type="submit"
                  color={rename ? undefined : "red"}
                  loading={busy}
                >
                  {rename ? "Save name" : `Delete ${edit?.kind || "item"}`}
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
function LibraryView({ controller }: { controller: LibraryActions }) {
  const view = useSyncExternalStore(
    controller.model.subscribe,
    controller.model.getSnapshot,
  );
  return (
    <>
      {createPortal(
        view.files.map((row) => (
          <LibraryRow
            key={row.id}
            row={row}
            controller={controller}
            menu={view.menu}
          />
        )),
        document.getElementById("audioFileList")!,
      )}
      {createPortal(
        view.bookmarks.map((row) => (
          <LibraryRow
            key={row.id}
            row={row}
            controller={controller}
            menu={view.menu}
          />
        )),
        document.getElementById("audioBookmarkList")!,
      )}
      <LibraryDialog
        controller={controller}
        edit={view.edit}
        opened={view.dialogOpen}
      />
    </>
  );
}
declare global {
  interface Window {
    SoundglowLibraryActions: typeof LibraryActions;
    SoundglowDiagnostics?: { capture(error: unknown, context: string): void };
  }
}
window.SoundglowLibraryActions = LibraryActions;
