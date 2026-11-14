import {
  ApplicationLayout,
  AppBrand,
  SettingsNavigationLink,
  isNavigationClick,
} from "@ldayton/ui/application-layout";
import { SidebarSelection, SidebarVolume } from "./sidebar-controls";
import { APP } from "./app-profile";
import { shellStatus } from "./shell-status";
import { createViewState } from "./view-state";
import { PracticeSurfaceViews } from "./practice-surfaces";
import { RetainedContent } from "./retained-content";
import {
  StrictMode,
  useLayoutEffect,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  Alert,
  Anchor,
  Box,
  Button,
  Collapse,
  Indicator,
  NavLink,
  Stack,
  Text,
  Title,
  VisuallyHidden,
} from "@mantine/core";
import { SoundToolsProvider } from "@ldayton/ui";
import { PracticeOptionsProvider, PracticeWorkspace } from "./practice-options";
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
} from "./exercise-catalog";
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
  const activityElements = [
    ...LIVE_EXERCISES.map((e) => e.rootId),
    ...(APP.id === "notewise" ? ["flashcards"] : []),
  ].map((id) => {
    const node = document.createElement("div");
    node.id = id;
    if (id !== "flashcards") node.className = "live-workspace";
    return node;
  });
  const midiPanel = document.createElement("div");
  midiPanel.id = "midi-panel";
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    document.querySelector<T>(selector)!;
  const initialState = {
    routeKind: "exercise" as AppRoute["kind"],
    title: APP.name,
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
    if (!isNavigationClick(event)) return;
    event.preventDefault();
    focusAfterNavigation = store.getSnapshot().navigationOpen;
    events.navigate(new URL(event.currentTarget.href), true);
  }
  function MidiContents() {
    useLayoutEffect(
      () => () => {
        document.getElementById("midi-parking")?.append(midiPanel);
      },
      [],
    );
    return <RetainedContent element={midiPanel} />;
  }
  function Navigation() {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const offline = useSyncExternalStore(
      offlineState.subscribe,
      offlineState.getSnapshot,
    );
    return (
      <Stack gap="md">
        <SidebarSelection />
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
        <Stack gap="xs">
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
            aria-controls="midi-connection-details"
            leftSection={<ShellIcon name="keyboard" />}
            rightSection={
              <Indicator
                color={snapshot.midi === "connected" ? "green" : "gray"}
                processing={
                  snapshot.midi === "requesting" || snapshot.midi === "opening"
                }
                position="middle-center"
              >
                <Box w={8} h={8} />
              </Indicator>
            }
            onClick={() => keyboardOpened(!snapshot.keyboardOpen)}
          >
            <Text component="span" size="sm">
              Keyboard
            </Text>
          </Button>
          <Collapse
            id="midi-connection-details"
            expanded={snapshot.keyboardOpen}
            keepMountedMode="display-none"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                keyboardOpened(false);
                document.querySelector<HTMLElement>(".keyboard-menu")?.focus();
              }
            }}
          >
            <MidiContents />
          </Collapse>
        </Stack>
        <SidebarVolume />
        <SettingsNavigationLink
          href="/settings"
          onClick={follow}
          active={snapshot.selected === "settings"}
          updateAvailable={offline.updateAvailable}
        />
        <Text size="xs" c="dimmed">
          SOUNDTOOLS
        </Text>
      </Stack>
    );
  }
  function Shell() {
    const status = useSyncExternalStore(
      shellStatus.subscribe,
      shellStatus.getSnapshot,
    );
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const activeOptionsId =
      LIVE_EXERCISES.find((definition) => definition.mode === snapshot.selected)
        ?.rootId ||
      (isFlashcardMode(snapshot.selected) ? "flashcards" : undefined);
    const brand = (
      <AppBrand name={APP.name} icon="/icon.svg" onClick={follow} />
    );
    return (
      <PracticeOptionsProvider
        activeId={activeOptionsId}
        activityKey={snapshot.selected}
      >
        <div hidden id="midi-parking">
          <RetainedContent element={midiPanel} />
        </div>
        <ApplicationLayout
          brand={brand}
          title={snapshot.title}
          area={snapshot.area}
          navigation={<Navigation />}
          navigationOpen={snapshot.navigationOpen}
          navigationCollapsed={snapshot.navigationCollapsed}
          onNavigationOpen={() => {
            events.interrupt("controls");
            store.set({ navigationOpen: true, keyboardOpen: false });
            events.inputChanged();
          }}
          onNavigationClose={closeNavigation}
          onNavigationCollapse={() => store.set({ navigationCollapsed: true })}
          onNavigationExpand={() => store.set({ navigationCollapsed: false })}
          onNavigationExited={() => {
            if (focusAfterNavigation) {
              focusAfterNavigation = false;
              focusTitle();
            }
          }}
          blocked={status.blocked}
          mainClassName={
            snapshot.routeKind !== "exercise"
              ? undefined
              : snapshot.selected === "sight"
                ? "hymn-layout"
                : snapshot.selected === "piano"
                  ? "piano-layout-wide"
                  : undefined
          }
        >
          <Alert
            id="persistence-notice"
            color={status.error ? "red" : "yellow"}
            hidden={!status.error && !status.notice}
          >
            {status.error || status.notice}
          </Alert>
          <section
            className="route-missing"
            hidden={snapshot.routeKind !== "not-found"}
          >
            <Title order={2}>Page not found</Title>
            <Text>
              Choose an exercise from the navigation to keep practising.
            </Text>
            <Anchor
              href={exercise(APP.defaultMode).path}
              data-mode={APP.defaultMode}
              onClick={follow}
            >
              {exercise(APP.defaultMode).title} →
            </Anchor>
          </section>
          <VisuallyHidden>
            <Text id="saved" size="xs" c="dimmed" role="status">
              {status.saved}
            </Text>
          </VisuallyHidden>
          <div id="exercise-content" hidden={snapshot.routeKind !== "exercise"}>
            <PracticeWorkspace>
              {activityElements.map((node) => (
                <div
                  key={node.id}
                  hidden={node.id !== (activeOptionsId || "flashcards")}
                >
                  <RetainedContent element={node} />
                </div>
              ))}
            </PracticeWorkspace>
          </div>
          <section
            id="settings-ui"
            className="soundtools-ui"
            aria-label="App settings"
            hidden={snapshot.selected !== "settings"}
          >
            <SettingsPage key={snapshot.settingsVisit} />
          </section>
        </ApplicationLayout>
        <PracticeSurfaceViews />
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
        <SoundToolsProvider
          primaryColor={APP.color}
          pageColor={APP.id === "songalong" ? "#f0f5f3" : "#f8f9fa"}
        >
          <Shell />
        </SoundToolsProvider>
      </StrictMode>,
    ),
  );
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
          ...(midi === "connected"
            ? { keyboardOpen: false, navigationOpen: false }
            : {}),
        }),
      );
      if (midi === "connected") {
        const trigger = document.querySelector<HTMLElement>(".keyboard-menu");
        if (trigger?.checkVisibility()) trigger.focus({ preventScroll: true });
        else focusTitle();
        queueMicrotask(events.inputChanged);
      }
    },
    render(route: AppRoute, mode: Mode) {
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
          routeKind: route.kind,
          settingsVisit:
            store.getSnapshot().settingsVisit +
            (route.kind === "settings" ? 1 : 0),
          area: route.kind !== "exercise" ? APP.name : current.area,
          selected:
            route.kind === "not-found"
              ? ""
              : route.kind === "settings"
                ? "settings"
                : mode,
        }),
      );
      document.title = `${title} · ${APP.name}`;
    },
  };
}
