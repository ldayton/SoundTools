import { RenderErrorBoundary } from "@ldayton/ui/render-error-boundary";
import { RendererLifetime } from "./renderer-lifetime";
import {
  ApplicationLayout,
  AppBrand,
  SettingsNavigationLink,
  isNavigationClick,
} from "@ldayton/ui/application-layout";
import { ToolbarVolume } from "./sidebar-controls";
import { hymnToolbarState } from "./hymn-toolbar-state";
import { PracticePianoToggle } from "./piano-presentation";
import { APP } from "./app-profile";
import { shellStatus } from "./shell-status";
import { createViewState } from "./view-state";
import {
  PracticeSurfaceViews,
  createPracticeRegistry,
} from "./practice-surfaces";
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
  Accordion,
  Group,
  Alert,
  Anchor,
  Box,
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
import { offlineState, offlineActions } from "./offline-state";
import { CompleteUpdateButton } from "@ldayton/ui/offline-status-panel";
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
import { type AppRoute } from "./navigation";
import type { Interruption } from "./live-practice";
import type { MidiState } from "./midi-input";

export function mountAppShell(
  element: HTMLElement,
  events: {
    navigate(url: URL, push: boolean): void;
    interrupt(reason: Interruption): void;
    inputChanged(): void;
    shutdown(): void;
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
  const registry = createPracticeRegistry();
  const lifetime = new RendererLifetime();
  const midiPanel = document.createElement("div");
  midiPanel.id = "midi-panel";
  for (const node of [...activityElements, midiPanel]) registry.bind(node);
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
  let renderFailed = false;
  let optionsOpen = false;
  function optionsOpened(opened: boolean) {
    optionsOpen = opened;
    if (opened) events.interrupt("controls");
    events.inputChanged();
  }
  let focusAfterNavigation = false;
  function focusTitle() {
    const heading =
      APP.id === "songalong" && store.getSnapshot().routeKind === "exercise"
        ? $(".sequence-title")
        : $("#page-title");
    heading.focus({ preventScroll: true });
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
    const views = useSyncExternalStore(
      registry.subscribe,
      registry.getSnapshot,
    );
    const offline = useSyncExternalStore(
      offlineState.subscribe,
      offlineState.getSnapshot,
    );
    return (
      <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
        {views.selection}
        {(APP.id === "songalong" ? [] : AREAS).map((area) => (
          <Box key={area.label}>
            <Text
              size="xs"
              c="dimmed"
              fw={600}
              mb="xs"
              hidden={APP.id === "songalong"}
            >
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
        <Stack gap="md" mt="auto" className="practice-navigation-tools">
          <Accordion
            keepMounted
            keepMountedMode="display-none"
            value={snapshot.keyboardOpen ? "keyboard" : null}
            onChange={(value) => keyboardOpened(value === "keyboard")}
          >
            <Accordion.Item value="keyboard">
              <Accordion.Control
                className="keyboard-menu"
                data-state={snapshot.midi}
                aria-label={
                  snapshot.midi === "connected"
                    ? "Keyboard connected"
                    : "Keyboard connection"
                }
              >
                <Group gap="sm">
                  <Text size="sm">Keyboard</Text>
                  <Indicator
                    color={snapshot.midi === "connected" ? "green" : "gray"}
                    position="middle-center"
                  >
                    <Box w={8} h={8} />
                  </Indicator>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <MidiContents />
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
          <SettingsNavigationLink
            href="/settings"
            onClick={follow}
            active={snapshot.selected === "settings"}
            updateAvailable={offline.updateAvailable}
          />
          <Text size="xs" c="dimmed" hidden={APP.id === "songalong"}>
            SOUNDTOOLS
          </Text>
        </Stack>
      </Stack>
    );
  }
  function Shell() {
    const toolbar = useSyncExternalStore(
      hymnToolbarState.subscribe,
      hymnToolbarState.getSnapshot,
    );
    const offline = useSyncExternalStore(
      offlineState.subscribe,
      offlineState.getSnapshot,
    );
    const views = useSyncExternalStore(
      registry.subscribe,
      registry.getSnapshot,
    );
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
        mobileDrawer
        onMobileOpenChange={optionsOpened}
        entries={views.options}
        activeId={activeOptionsId}
        activityKey={snapshot.selected}
      >
        <div hidden id="midi-parking">
          <RetainedContent element={midiPanel} />
        </div>
        <ApplicationLayout
          updateAction={
            offline.updateAvailable ? (
              <CompleteUpdateButton onClick={() => offlineActions.update()} />
            ) : undefined
          }
          compact
          resizableNavigation
          mainClassName={
            APP.id === "songalong"
              ? "songalong-workspace"
              : "notewise-workspace"
          }
          brand={brand}
          mobileToolbarHeight={
            APP.id === "songalong" ? (toolbar.expanded ? 220 : 56) : 104
          }
          headerClassName={
            APP.id === "notewise" ? "notewise-header" : "songalong-header"
          }
          title={snapshot.title}
          toolbarOnly={snapshot.routeKind === "exercise"}
          headerActions={
            snapshot.routeKind === "exercise" ? (
              APP.id === "songalong" ? (
                <RetainedContent
                  element={registry.headerFor(activeOptionsId || "flashcards")}
                  className="songalong-header-transport"
                />
              ) : (
                <div className="notewise-toolbar">
                  <ToolbarVolume />
                  <RetainedContent
                    element={registry.headerFor(
                      activeOptionsId || "flashcards",
                    )}
                    className="notewise-toolbar-session"
                  />
                  <div
                    className="notewise-toolbar-piano"
                    style={{
                      visibility:
                        snapshot.selected === "piano" ? "hidden" : undefined,
                    }}
                  >
                    <PracticePianoToggle
                      iconOnly
                      panelId={`${activeOptionsId || "flashcards"}-piano-panel`}
                      disabled={snapshot.selected === "piano"}
                    />
                  </div>
                </div>
              )
            ) : APP.id === "notewise" ? (
              <ToolbarVolume />
            ) : undefined
          }
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
            {APP.id === "notewise" && (
              <Title
                id={
                  snapshot.routeKind === "exercise" ? "page-title" : undefined
                }
                className="practice-title"
                order={1}
                size="h3"
                tabIndex={-1}
                mb="md"
              >
                {snapshot.title}
              </Title>
            )}
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
        <PracticeSurfaceViews registry={registry} />
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
        <RenderErrorBoundary
          appName={APP.name}
          onStop={() => {
            renderFailed = true;
            events.shutdown();
          }}
          onError={(error) => diagnostics.capture(error, "shell.render_failed")}
        >
          <SoundToolsProvider
            primaryColor={APP.color}
            pageColor={APP.id === "songalong" ? "#f0f5f3" : "#f8f9fa"}
          >
            <Shell />
          </SoundToolsProvider>
        </RenderErrorBoundary>
      </StrictMode>,
    ),
  );
  lifetime.listen(window, "popstate", () =>
    events.navigate(new URL(location.href), false),
  );
  return {
    dispose() {
      if (lifetime.disposed) return;
      lifetime.dispose();
      registry.dispose();
      root.unmount();
    },
    activityElement(mode: LiveMode) {
      return $("#" + LIVE_EXERCISES.find((e) => e.mode === mode)!.rootId);
    },
    get inputBlocked() {
      return (
        renderFailed ||
        optionsOpen ||
        store.getSnapshot().navigationOpen ||
        store.getSnapshot().keyboardOpen
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
      document.title =
        APP.id === "songalong" && route.kind === "exercise"
          ? APP.name
          : `${title} · ${APP.name}`;
    },
  };
}
