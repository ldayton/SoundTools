import { createViewState } from "./view-state";
import { PracticeSurfaceViews } from "./practice-surfaces";
import { RetainedContent } from "./retained-content";
import {
  StrictMode,
  useEffect,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  ActionIcon,
  Anchor,
  AppShell,
  Box,
  Burger,
  Button,
  Drawer,
  Group,
  Indicator,
  NavLink,
  Popover,
  Stack,
  Text,
  Title,
  useMantineTheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { SoundToolsProvider } from "@ldayton/ui";
import {
  PracticeOptionsProvider,
  PracticeOptionsReopen,
  PracticeWorkspace,
} from "./practice-options";
import { SettingsPage } from "./settings-page";
import { offlineState } from "./offline-state";
import { diagnostics } from "./diagnostics";
import {
  AREAS,
  LIVE_EXERCISES,
  exercise,
  isLiveMode,
  isFlashcardMode,
  type Mode,
  type LiveMode,
} from "./exercises";
import { icon, type AppRoute } from "./navigation";
import type { Interruption } from "./live-practice";
import type { MidiState } from "./midi-input";

function ShellIcon({ name }: { name: string }) {
  return (
    <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon(name) }} />
  );
}

export function mountAppShell(
  element: HTMLElement,
  events: {
    navigate(url: URL, push: boolean): void;
    interrupt(reason: Interruption): void;
    inputChanged(): void;
  },
) {
  const workspace = document.createElement("div");
  workspace.innerHTML = `<p id="persistence-notice" role="alert" hidden></p><section class="route-missing" hidden><h2>Page not found</h2><p>Choose an exercise from the navigation to keep practising.</p><a href="/piano/keys" data-mode="piano">Find piano keys →</a></section><p id="saved" class="saved" role="status">Opening saved practice…</p><div id="exercise-content">${LIVE_EXERCISES.map((e) => `<div id="${e.rootId}" class="live-workspace" hidden></div>`).join("")}<div id="flashcards"></div></div>`;
  const midiPanel = document.createElement("div");
  midiPanel.id = "midi-panel";
  // Portals mount after the shell's first commit. Keep the connection form in
  // the document until the popover adopts this same element (and its listeners).
  const midiParking = document.createElement("div");
  midiParking.hidden = true;
  midiParking.append(midiPanel);
  workspace.append(midiParking);
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    document.querySelector<T>(selector)!;
  const initialState = {
    title: "Note by Note",
    area: "",
    selected: "",
    settingsVisit: 0,
    midi: "idle" as MidiState,
    navigationCollapsed: false,
    navigationOpen: false,
    keyboardOpen: false,
  };
  const model = createViewState(initialState);
  const store = {
    getSnapshot: model.getSnapshot,
    subscribe: model.subscribe,
    set(patch: Partial<typeof initialState>) {
      model.set({ ...model.getSnapshot(), ...patch });
    },
  };
  let focusAfterNavigation = false;
  function focusTitle() {
    $("#page-title").focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }
  function closeNavigation() {
    if (!store.getSnapshot().navigationOpen) return;
    store.set({ navigationOpen: false });
    events.inputChanged();
  }
  function keyboardOpened(opened: boolean) {
    if (opened) events.interrupt("controls");
    store.set({ keyboardOpen: opened });
    events.inputChanged();
  }
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    focusAfterNavigation = store.getSnapshot().navigationOpen;
    events.navigate(new URL(event.currentTarget.href), true);
  }
  function Navigation() {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const offline = useSyncExternalStore(
      offlineState.subscribe,
      offlineState.getSnapshot,
    );
    return (
      <Stack gap="md">
        {AREAS.map((area) => (
          <Box key={area.label}>
            <Text size="xs" c="dimmed" fw={600} mb="xs">
              {area.label}
            </Text>
            {area.items.map((item) => (
              <NavLink
                key={item.mode}
                component="a"
                href={item.path}
                label={item.title}
                data-mode={item.mode}
                onClick={follow}
                active={snapshot.selected === item.mode}
                aria-current={
                  snapshot.selected === item.mode ? "page" : undefined
                }
              />
            ))}
          </Box>
        ))}
        <NavLink
          component="a"
          href="/settings"
          label="Settings"
          data-settings
          onClick={follow}
          leftSection={<ShellIcon name="settings" />}
          active={snapshot.selected === "settings"}
          aria-current={snapshot.selected === "settings" ? "page" : undefined}
          rightSection={
            offline.updateAvailable ? (
              <Indicator color="orange" position="middle-center">
                <Box w={8} h={8} role="img" aria-label="Update available" />
              </Indicator>
            ) : undefined
          }
        />
        <Text size="xs" c="dimmed">
          SOUNDTOOLS
        </Text>
      </Stack>
    );
  }
  function Shell() {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const theme = useMantineTheme();
    const desktop = useMediaQuery(
      `(min-width: ${theme.breakpoints.sm})`,
      undefined,
      { getInitialValueInEffect: false },
    );
    useEffect(() => {
      if (desktop) closeNavigation();
    }, [desktop]);
    const brand = (
      <Anchor
        href="/"
        onClick={follow}
        aria-label="Note by Note home"
        c="inherit"
        underline="never"
      >
        <Group gap="xs" wrap="nowrap">
          <img src="/icon.svg" alt="" width="28" height="28" />
          <Text fw={600}>Note by Note</Text>
        </Group>
      </Anchor>
    );
    const activeOptionsId =
      LIVE_EXERCISES.find((definition) => definition.mode === snapshot.selected)
        ?.rootId ||
      (isFlashcardMode(snapshot.selected) ? "flashcards" : undefined);
    return (
      <PracticeOptionsProvider
        activeId={activeOptionsId}
        activityKey={snapshot.selected}
      >
        <Anchor href="#practice-content" className="skip-link">
          Skip to practice
        </Anchor>
        <AppShell
          header={{ height: 72 }}
          navbar={{
            width: 244,
            breakpoint: "sm",
            collapsed: { desktop: snapshot.navigationCollapsed, mobile: true },
          }}
          padding="md"
        >
          <AppShell.Header className="soundtools-ui">
            <Group h="100%" px="md" wrap="nowrap">
              {(!desktop || snapshot.navigationCollapsed) && (
                <Burger
                  className="nav-toggle"
                  size="sm"
                  opened={!desktop && snapshot.navigationOpen}
                  aria-label="Open navigation"
                  aria-expanded={!desktop ? snapshot.navigationOpen : false}
                  aria-controls="practice-navigation"
                  onClick={() => {
                    if (desktop) {
                      store.set({ navigationCollapsed: false });
                      requestAnimationFrame(() => $(".nav-close")?.focus());
                    } else {
                      events.interrupt("controls");
                      store.set({ navigationOpen: true, keyboardOpen: false });
                      events.inputChanged();
                    }
                  }}
                />
              )}
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text size="xs" c="dimmed">
                  {snapshot.area}
                </Text>
                <Title
                  id="page-title"
                  order={1}
                  size="h3"
                  lineClamp={1}
                  tabIndex={-1}
                >
                  {snapshot.title}
                </Title>
              </Box>
              <PracticeOptionsReopen />
              <Popover
                id="midi-connection"
                opened={snapshot.keyboardOpen}
                onChange={keyboardOpened}
                position="bottom-end"
                width={300}
                keepMounted
                trapFocus
              >
                <Popover.Target>
                  <Button
                    className="keyboard-menu"
                    data-state={snapshot.midi}
                    variant="default"
                    aria-label={
                      snapshot.midi === "connected"
                        ? "Keyboard connected"
                        : "Keyboard connection"
                    }
                    aria-expanded={snapshot.keyboardOpen}
                    leftSection={<ShellIcon name="keyboard" />}
                    rightSection={
                      <Indicator
                        color={snapshot.midi === "connected" ? "green" : "gray"}
                        processing={
                          snapshot.midi === "requesting" ||
                          snapshot.midi === "opening"
                        }
                        position="middle-center"
                      >
                        <Box w={8} h={8} />
                      </Indicator>
                    }
                    onClick={() => keyboardOpened(!snapshot.keyboardOpen)}
                  >
                    <Text component="span" visibleFrom="sm" size="sm">
                      Keyboard
                    </Text>
                  </Button>
                </Popover.Target>
                <Popover.Dropdown className="soundtools-ui">
                  <RetainedContent element={midiPanel} />
                </Popover.Dropdown>
              </Popover>
            </Group>
          </AppShell.Header>
          {desktop && (
            <AppShell.Navbar
              id="practice-navigation"
              aria-label="Exercises"
              className="soundtools-ui app-sidebar"
              p="md"
              style={{ overflowY: "auto" }}
              inert={snapshot.navigationCollapsed}
            >
              <Group justify="space-between" wrap="nowrap" mb="lg">
                {brand}
                <ActionIcon
                  className="nav-close"
                  variant="subtle"
                  aria-label="Collapse navigation"
                  onClick={() => {
                    store.set({ navigationCollapsed: true });
                    requestAnimationFrame(() => $(".nav-toggle").focus());
                  }}
                >
                  <ShellIcon name="panelLeft" />
                </ActionIcon>
              </Group>
              <Navigation />
            </AppShell.Navbar>
          )}
          <AppShell.Main id="practice-content" tabIndex={-1}>
            <div className="workspace-content">
              <PracticeWorkspace>
                <RetainedContent element={workspace} />
              </PracticeWorkspace>
              <section
                id="settings-ui"
                className="settings-page soundtools-ui"
                aria-label="App settings"
                hidden={snapshot.selected !== "settings"}
              >
                <SettingsPage key={snapshot.settingsVisit} />
              </section>
            </div>
          </AppShell.Main>
        </AppShell>
        <PracticeSurfaceViews />
        <Drawer
          id="navigation-drawer"
          opened={!desktop && snapshot.navigationOpen}
          onClose={closeNavigation}
          title={brand}
          closeButtonProps={{ "aria-label": "Close navigation" }}
          classNames={{ content: "soundtools-ui" }}
          onExitTransitionEnd={() => {
            if (focusAfterNavigation) {
              focusAfterNavigation = false;
              focusTitle();
            }
          }}
        >
          <Box
            component="nav"
            aria-label="Exercises"
            id="practice-navigation"
            className="app-sidebar"
          >
            <Navigation />
          </Box>
        </Drawer>
      </PracticeOptionsProvider>
    );
  }
  const root = createRoot(element, {
    onUncaughtError: (error) =>
      diagnostics.capture(error, "shell.render_failed"),
  });
  flushSync(() =>
    root.render(
      <StrictMode>
        <SoundToolsProvider>
          <Shell />
        </SoundToolsProvider>
      </StrictMode>,
    ),
  );
  workspace.addEventListener("click", (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>(
      "a[data-mode]",
    );
    if (
      !link ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    events.navigate(new URL(link.href), true);
  });
  window.addEventListener("popstate", () =>
    events.navigate(new URL(location.href), false),
  );
  return {
    activityElement(mode: LiveMode) {
      return $("#" + LIVE_EXERCISES.find((e) => e.mode === mode)!.rootId);
    },
    get inputBlocked() {
      return (
        store.getSnapshot().navigationOpen || store.getSnapshot().keyboardOpen
      );
    },
    closeMenus() {
      store.set({ navigationOpen: false, keyboardOpen: false });
      events.inputChanged();
    },
    focusContent() {
      if (!focusAfterNavigation) focusTitle();
    },
    reportMidi(midi: MidiState) {
      flushSync(() =>
        store.set({
          midi,
          ...(midi === "connected" ? { keyboardOpen: false } : {}),
        }),
      );
      if (midi === "connected") {
        $(".keyboard-menu").focus({ preventScroll: true });
        queueMicrotask(events.inputChanged);
      }
    },
    render(route: AppRoute, mode: Mode) {
      for (const definition of LIVE_EXERCISES)
        $("#" + definition.rootId).hidden =
          route.kind !== "exercise" || mode !== definition.mode;
      $("#flashcards").hidden = route.kind !== "exercise" || isLiveMode(mode);
      $("#practice-content").classList.toggle(
        "hymn-layout",
        route.kind === "exercise" && mode === "sight",
      );
      $("#practice-content").classList.toggle(
        "piano-layout-wide",
        route.kind === "exercise" && mode === "piano",
      );
      const current = exercise(mode);
      const title =
        route.kind === "not-found"
          ? "Page not found"
          : route.kind === "settings"
            ? "Settings"
            : current.title;
      flushSync(() =>
        store.set({
          title,
          settingsVisit:
            store.getSnapshot().settingsVisit +
            (route.kind === "settings" ? 1 : 0),
          area: route.kind !== "exercise" ? "Note by Note" : current.area,
          selected:
            route.kind === "not-found"
              ? ""
              : route.kind === "settings"
                ? "settings"
                : mode,
        }),
      );
      document.title = `${title} · Note by Note`;
      $(".route-missing").hidden = route.kind !== "not-found";
      $("#exercise-content").hidden = route.kind !== "exercise";
    },
  };
}
