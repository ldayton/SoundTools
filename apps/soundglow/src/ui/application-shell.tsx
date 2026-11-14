// SPDX-License-Identifier: GPL-3.0-or-later
import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Group,
  Tabs,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { SoundToolsProvider } from "@ldayton/ui";
import { RetainedContent } from "@ldayton/ui/retained-content";
import { createViewState } from "@ldayton/ui/view-state";
import "./shell.css";
import {
  createSpectrogramPresets,
  createPitchPresets,
} from "./preset-controls";
import { LibraryView, type LibraryActions } from "./library-actions";
import { createWorkspaceFeedback } from "./workspace-feedback";
import { createSystemControls } from "./system-controls";
import { createSelectionControls } from "./selection-controls";
import { createFileControls } from "./file-controls";
import { createTransportControls } from "./transport-controls";
import { createPitchControls } from "./pitch-controls";
import { createPortal } from "react-dom";
import { createSpectrogramControls } from "./spectrogram-display";

type Feature = "spectrogram" | "pitch";
type Handlers = { layout(): void; select(feature: Feature): void };

/** React owns workspace geometry/navigation; retained nodes own audio and drawing. */
export function mountApplicationShell() {
  const take = (id: string) => document.getElementById(id)!;
  const retained = {
    actions: take("headerActions"),
    transport: take("workspaceTransport"),
    visual: take("visual"),
    files: take("filesBody"),
    settings: take("settingsBody"),
  };
  // HTML already resolves branding to the current immutable offline release.
  const icon = document.querySelector<HTMLLinkElement>(
    'link[rel="icon"][type="image/svg+xml"]',
  )!.href;
  let updateLibrary: Dispatch<SetStateAction<LibraryActions | null>> = () => {};
  let home: (() => void) | undefined;
  function LibraryOutlet() {
    const [controller, setController] = useState<LibraryActions | null>(null);
    useLayoutEffect(() => {
      updateLibrary = setController;
      return () => {
        updateLibrary = () => {};
      };
    }, []);
    return controller ? <LibraryView controller={controller} /> : null;
  }
  const feedback = createWorkspaceFeedback();
  const StateLabel = feedback.State,
    Notice = feedback.Notice,
    Footer = feedback.Footer,
    Welcome = feedback.Welcome,
    LibraryHeader = feedback.LibraryHeader,
    Bookmarks = feedback.Bookmarks,
    FileTitle = feedback.FileTitle,
    AnalysisStatus = feedback.AnalysisStatus;
  const welcomeHost = take("welcomeHost"),
    footerHost = take("footerHost"),
    libraryHeaderHost = take("libraryHeader"),
    bookmarksHost = take("bookmarksHost"),
    fileTitleHost = take("fileTitleHost"),
    analysisStatusHost = take("analysisStatusHost");
  const system = createSystemControls();
  const Offline = system.Offline,
    Developer = system.Developer,
    Update = system.Update;
  const offlineHost = take("offlineSettings"),
    developerHost = take("developerControls");
  const selectionControls = createSelectionControls();
  const Selection = selectionControls.Selection,
    PlaybackOptions = selectionControls.Options;
  const selectionHost = take("fileSelectionHost");
  const fileControls = createFileControls();
  const FilePlayback = fileControls.Playback,
    FileOptions = fileControls.Options,
    FileTime = fileControls.Time;
  const filePlaybackHost = take("filePlaybackControls"),
    fileOptionsHost = take("filePlaybackOptions"),
    fileTimeHost = take("fileTimeHost");
  const transport = createTransportControls();
  const WelcomeActions = transport.WelcomeActions;
  const TransportButtons = transport.Buttons,
    MicrophoneControls = transport.Microphone,
    ExampleControls = transport.Example;
  const microphoneHost = take("audioInputSettings"),
    exampleHost = take("exampleControls");
  const presets = createSpectrogramPresets();
  const pitchPresets = createPitchPresets();
  const PitchPresets = pitchPresets.Controls,
    pitchPresetsHost = take("pitchPresets");
  const Presets = presets.Controls,
    presetsHost = take("spectrogramPresets");
  const spectrogram = createSpectrogramControls(window.SettingsState.registry);
  const pitch = createPitchControls(
    window.FeatureState.pitch(window.FeatureState.presets.soundglow),
    window.FeatureState.inputLimits,
    window.FeatureState.rangeLimits,
  );
  const PitchTargets = pitch.TargetControls,
    pitchTargetsHost = take("pitchTargets");
  const PitchTrace = pitch.TraceControls,
    pitchTraceHost = take("pitchTrace");
  const PitchBasic = pitch.BasicControls,
    pitchBasicHost = take("pitchBasic");
  const displayHost = take("spectrogramDisplay");
  const DisplayControls = spectrogram.DisplayControls;
  const ColourControls = spectrogram.ColourControls;
  const colourHost = take("spectrogramColour");
  const AdvancedColourControls = spectrogram.AdvancedColourControls,
    advancedColourHost = take("spectrogramAdvancedColour");
  const AnalysisControls = spectrogram.AnalysisControls,
    analysisHost = take("spectrogramAnalysis");
  const FormantControls = spectrogram.FormantControls,
    formantHost = take("spectrogramFormants");
  const media = window.matchMedia("(min-width: 761px)");
  const model = createViewState({
    desktop: media.matches,
    open: location.hash === "#settings",
    files: true,
    settings: true,
    feature: "spectrogram" as Feature,
  });
  let handlers: Handlers | undefined;
  let returnToToggle = false;
  function patch(next: Partial<ReturnType<typeof model.getSnapshot>>) {
    flushSync(() => model.set({ ...model.getSnapshot(), ...next }));
  }
  function sync() {
    const open = location.hash === "#settings";
    const returnFocus =
      !open &&
      (returnToToggle || take("panel").contains(document.activeElement));
    if (!open) returnToToggle = false;
    patch({ open, desktop: media.matches });
    if (returnFocus) take(media.matches ? "openSettings" : "settings").focus();
    handlers?.layout();
    // Canvas sizing observes actual geometry, including the end of the CSS transition.
  }
  function panel(open: boolean) {
    if (open === (location.hash === "#settings")) return;
    returnToToggle = !open;
    if (open)
      history.pushState(
        { soundglowSettings: true },
        "",
        location.pathname + location.search + "#settings",
      );
    else if (history.state?.soundglowSettings) {
      history.back();
      return;
    } else history.replaceState(null, "", location.pathname + location.search);
    sync();
  }
  function openFiles() {
    patch({ files: true });
    panel(true);
  }
  function Shell() {
    const view = useSyncExternalStore(model.subscribe, model.getSnapshot);
    useEffect(() => {
      const events = new AbortController();
      window.addEventListener("popstate", sync, { signal: events.signal });
      window.addEventListener("hashchange", sync, { signal: events.signal });
      window.addEventListener("pageshow", sync, { signal: events.signal });
      media.addEventListener("change", sync, { signal: events.signal });
      return () => events.abort();
    }, []);
    useLayoutEffect(() => {
      retained.visual.inert = view.open && !view.desktop;
    }, [view.open, view.desktop]);
    const settingsLabel = view.open
      ? view.desktop
        ? "Close settings"
        : `Return to ${view.feature}`
      : "Settings";
    return (
      <>
        <LibraryOutlet />
        {createPortal(
          <TransportButtons />,
          view.desktop ? retained.transport : retained.actions,
        )}
        {createPortal(<MicrophoneControls />, microphoneHost)}
        {createPortal(<ExampleControls />, exampleHost)}
        {createPortal(<FilePlayback />, filePlaybackHost)}
        {createPortal(
          <PlaybackOptions>
            <FileOptions />
          </PlaybackOptions>,
          fileOptionsHost,
        )}
        {createPortal(<Selection />, selectionHost)}
        {createPortal(<FileTime />, fileTimeHost)}
        {createPortal(<Offline />, offlineHost)}
        {createPortal(<Developer />, developerHost)}
        {createPortal(<Update />, retained.actions)}
        {createPortal(
          <Welcome>
            <WelcomeActions />
          </Welcome>,
          welcomeHost,
        )}
        {createPortal(<Footer />, footerHost)}
        {createPortal(<LibraryHeader />, libraryHeaderHost)}
        {createPortal(<Bookmarks />, bookmarksHost)}
        {createPortal(<FileTitle />, fileTitleHost)}
        {createPortal(<AnalysisStatus />, analysisStatusHost)}
        {createPortal(<DisplayControls />, displayHost)}
        {createPortal(<Presets />, presetsHost)}
        {createPortal(<PitchPresets />, pitchPresetsHost)}
        {createPortal(<PitchBasic />, pitchBasicHost)}
        {createPortal(<PitchTrace />, pitchTraceHost)}
        {createPortal(<PitchTargets />, pitchTargetsHost)}
        {createPortal(<ColourControls />, colourHost)}
        {createPortal(<FormantControls />, formantHost)}
        {createPortal(<AnalysisControls />, analysisHost)}
        {createPortal(<AdvancedColourControls />, advancedColourHost)}
        <Box component="header" className="soundglow-header soundtools-ui">
          <Group className="brand" gap="xs" wrap="nowrap">
            <Anchor
              id="home"
              onClick={(event) => {
                event.preventDefault();
                home?.();
              }}
              href="#"
              aria-label="Soundglow home"
              c="inherit"
              underline="never"
            >
              <Group gap="xs" wrap="nowrap">
                <img src={icon} width="24" height="24" alt="" />
                <Text component="h1" size="sm" fw={600} m={0}>
                  Soundglow
                </Text>
              </Group>
            </Anchor>
            <StateLabel />
          </Group>
          <Group gap="xs" wrap="nowrap" className="soundglow-actions">
            <Button
              id="openFiles"
              variant="default"
              size="compact-sm"
              aria-label="Open files library"
              onClick={openFiles}
            >
              Files
            </Button>
            <RetainedContent
              element={retained.actions}
              className="shell-retained"
            />
            <ActionIcon
              id="settings"
              variant="default"
              size="lg"
              aria-label={settingsLabel}
              title={settingsLabel}
              aria-expanded={view.open}
              aria-controls="panel"
              onClick={() => panel(!view.open)}
            >
              ⚙
            </ActionIcon>
          </Group>
        </Box>
        <Box
          id="workspaceToolbar"
          className="soundtools-ui"
          role="group"
          aria-label="Audio controls"
        >
          <ActionIcon
            id="openSettings"
            variant="default"
            size="lg"
            aria-label={view.open ? "Hide settings" : "Show settings"}
            title={view.open ? "Hide settings" : "Show settings"}
            aria-expanded={view.open}
            aria-controls="panel"
            onClick={() => panel(!view.open)}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16" />
            </svg>
          </ActionIcon>
          <span className="toolbarDivider" aria-hidden="true" />
          <RetainedContent
            element={retained.transport}
            className="shell-retained"
          />
        </Box>
        <Tabs
          value={view.feature}
          onChange={(value) => {
            if (value) handlers?.select(value as Feature);
          }}
          className="soundtools-ui shell-tabs"
          keepMounted
        >
          <Tabs.List id="featureTabs" aria-label="Views">
            <Tabs.Tab
              id="spectrogramTab"
              value="spectrogram"
              aria-controls="plot"
            >
              Spectrogram
            </Tabs.Tab>
            <Tabs.Tab id="pitchTab" value="pitch" aria-controls="plot">
              Pitch
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
        <Box
          component="main"
          id="stage"
          className={view.open ? "settings-open" : undefined}
        >
          <Box className="soundtools-ui">
            <Notice />
          </Box>
          <RetainedContent
            element={retained.visual}
            className="shell-retained"
          />
          <Box
            component="aside"
            id="panel"
            aria-label="Files and settings"
            aria-hidden={!view.open}
            inert={!view.open}
          >
            <Box
              component="section"
              id="filesSection"
              className="sidebar-section"
            >
              <Box component="h2" m={0}>
                <UnstyledButton
                  id="toggleFiles"
                  className="shell-disclosure soundtools-ui"
                  aria-expanded={view.files}
                  aria-controls="filesBody"
                  onClick={() => patch({ files: !view.files })}
                >
                  Files <span aria-hidden="true">{view.files ? "⌄" : "›"}</span>
                </UnstyledButton>
              </Box>
              <Box hidden={!view.files} className="shell-retained">
                <RetainedContent
                  element={retained.files}
                  className="shell-retained"
                />
              </Box>
            </Box>
            <Box className="panelhead">
              <Box component="h2" m={0}>
                <UnstyledButton
                  id="settingsSectionToggle"
                  className="shell-disclosure soundtools-ui"
                  aria-expanded={view.settings}
                  aria-controls="settingsBody"
                  onClick={() => patch({ settings: !view.settings })}
                >
                  Settings{" "}
                  <span aria-hidden="true">{view.settings ? "⌄" : "›"}</span>
                </UnstyledButton>
              </Box>
            </Box>
            <Box hidden={!view.settings} className="shell-retained">
              <RetainedContent
                element={retained.settings}
                className="shell-retained"
              />
            </Box>
          </Box>
        </Box>
      </>
    );
  }
  const root = createRoot(take("app"), {
    onUncaughtError: (error) =>
      window.SoundglowDiagnostics?.capture(error, "shell.ui_failed"),
  });
  flushSync(() =>
    root.render(
      <SoundToolsProvider
        colorScheme="dark"
        primaryColor="orange"
        pageColor="#080b10"
      >
        <Shell />
      </SoundToolsProvider>,
    ),
  );
  // The root lives with its document. Do not unmount on pagehide: audio shutdown
  // can still refer to controls, and a cached document may be restored intact.
  return {
    media,
    attachLibrary(controller: LibraryActions) {
      flushSync(() => updateLibrary(controller));
    },
    detachLibrary(controller: LibraryActions) {
      updateLibrary((current) => (current === controller ? null : current));
    },
    connectHome(action: () => void) {
      home = action;
    },
    selectFeature(feature: Feature) {
      handlers?.select(feature);
    },
    spectrogram,
    presets,
    pitchPresets,
    transport,
    fileControls,
    selectionControls,
    feedback,
    offline: system.offline,
    performance: system.performance,
    pitch,
    panel,
    openFiles,
    showView() {
      if (location.hash !== "#settings") return;
      history.replaceState(null, "", location.pathname + location.search);
      sync();
    },
    configure(next: Handlers) {
      handlers = next;
    },
    setFeature(feature: Feature) {
      if (model.getSnapshot().feature !== feature) patch({ feature });
    },
  };
}
