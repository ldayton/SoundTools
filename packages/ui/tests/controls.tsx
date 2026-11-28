import { PracticeOptionsProvider } from "../practice-workspace";
import { ApplicationLayout } from "../application-layout";
import { CompleteUpdateButton, UpdateBar } from "../offline-status-panel";
import "../../../apps/soundglow/src/ui/shell.css";
import { restoreFocus } from "../restore-focus";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  Modal,
  NativeSelect,
  Select,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { ToolbarSlider } from "../toolbar-slider";
import { VolumeControl } from "../volume-control";
import { ToolbarNumber } from "../toolbar-number";
import { SoundToolsProvider } from "../provider";
import { RenderErrorBoundary } from "../render-error-boundary";
import { PitchField } from "../pitch-field";
import { CommittedNumber } from "../committed-number";
import { createViewState } from "../view-state";
import {
  PracticeView,
  PracticeToolbar,
} from "../../../apps/dorego/src/practice-view";
import type {
  PracticeSnapshot,
  PianoSnapshot,
} from "../../../apps/dorego/src/practice-view";
const practice = createViewState<PracticeSnapshot>({
  mode: "playing",
  warming: false,
  failed: false,
  error: null,
  title: "Practice",
  bpm: 120,
  volume: -12,
  toast: "",
  readout: null,
});
const playback = createViewState({
  position: 0,
  duration: 100,
  round: 0,
  rounds: 1,
});
const piano = createViewState<PianoSnapshot>({
  low: 60,
  high: 67,
  root: 60,
  pitches: [60, 62, 64, 65, 67],
  labels: { "60": "C4", "62": "D4", "64": "E4", "65": "F4", "67": "G4" },
  voices: [],
});
let reads = 0;
const instrumented = {
  subscribe: practice.subscribe,
  getSnapshot: () => {
    reads++;
    return practice.getSnapshot();
  },
};
window.restoreFocusTest = restoreFocus;
window.clockTest = {
  reads: () => reads,
  advance: () =>
    playback.set({
      position: playback.getSnapshot().position + 1,
      duration: 100,
      round: 0,
      rounds: 1,
    }),
};
declare global {
  interface Window {
    restoreFocusTest: typeof restoreFocus;
    clockTest: { reads(): number; advance(): void };
  }
}

function Controls() {
  const [toolbarVolume, setToolbarVolume] = useState(37);
  const [inlineVolume, setInlineVolume] = useState(68);
  const [mobileDialog, setMobileDialog] = useState(false);
  const [pitch, setPitch] = useState(0);
  const [pitchOpen, setPitchOpen] = useState(false);
  const [integer, setInteger] = useState(120),
    [decimal, setDecimal] = useState(1.5);
  const [calls, setCalls] = useState(0),
    [reset, setReset] = useState(0);
  return (
    <SoundToolsProvider>
      <Stack p="md">
        <PitchField
          id="test-pitch"
          label="Test pitch"
          value={pitch}
          onChange={setPitch}
          opened={pitchOpen}
          onOpenedChange={setPitchOpen}
          choices={[
            { value: 0, label: "C3", octave: 3, column: 0 },
            { value: 12, label: "C4", octave: 4, column: 0 },
          ]}
        />
        <CommittedNumber
          id="integer"
          label="Integer"
          min={40}
          max={240}
          value={integer}
          change={(n) => {
            setCalls((c) => c + 1);
            setInteger(n);
          }}
        />
        <CommittedNumber
          id="decimal"
          label="Decimal"
          allowDecimal
          min={0}
          max={10}
          step={0.1}
          value={decimal}
          reset={reset}
          change={(n) => {
            if (n > 5) return false;
            setDecimal(n);
            return true;
          }}
        />
        <output id="canonical">
          {integer}:{decimal}:{calls}
        </output>
        <Button
          id="reset"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setReset((n) => n + 1)}
        >
          Reset draft
        </Button>
        <Button
          id="external"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setInteger(140)}
        >
          External change
        </Button>
        <Button id="outside">Outside</Button>
        <TextInput id="zoom-text" label="Small text field" size="xs" />
        <Textarea id="zoom-textarea" label="Small text area" size="xs" />
        <NativeSelect
          id="zoom-native-select"
          label="Native select"
          size="xs"
          data={["One", "Two"]}
        />
        <Select
          id="zoom-select"
          label="Select"
          size="xs"
          data={["One", "Two"]}
        />
        <TextInput id="zoom-large" label="Large text field" size="xl" />
        <input
          id="zoom-native"
          aria-label="Native text field"
          style={{ fontSize: 12 }}
        />
        <div
          id="zoom-editable"
          contentEditable
          suppressContentEditableWarning
          style={{ fontSize: 12 }}
        >
          Editable text
        </div>
        <ToolbarNumber
          id="zoom-tempo"
          label="Tempo"
          unit="BPM"
          icon={null}
          value={100}
          min={40}
          max={240}
          onChange={() => {}}
        />
        <Button id="zoom-dialog-open" onClick={() => setMobileDialog(true)}>
          Open mobile fields
        </Button>
        <Modal
          opened={mobileDialog}
          onClose={() => setMobileDialog(false)}
          title="Mobile fields"
        >
          <TextInput
            id="zoom-dialog-input"
            label="Dialog text field"
            size="xs"
          />
        </Modal>
        <div id="toolbar-volume-fixture">
          <ToolbarSlider id="test-toolbar-volume" label="Toolbar volume" value={toolbarVolume} min={0} max={100} onChange={setToolbarVolume} withMute icon={<span aria-hidden="true">♫</span>} />
          <Button id="external-volume" onClick={() => setToolbarVolume(65)}>Change volume externally</Button>
          <output id="toolbar-volume-value">{toolbarVolume}</output>
        </div>
        <div id="inline-volume-fixture">
          <VolumeControl id="test-inline-volume" value={inlineVolume} onChange={setInlineVolume} />
        </div>
        <PracticeToolbar model={instrumented} range={null} tempo={() => {}} volume={() => {}} />
        <PracticeView
          model={instrumented}
          playback={playback}
          piano={piano}
          audition={() => () => {}}
          play={() => {}}
          restart={() => {}}
          moveRound={() => {}}
          repeatRound={() => {}}
        />
      </Stack>
    </SoundToolsProvider>
  );
}
function Crashable() {
  const [crashed, crash] = useState(false);
  if (crashed) throw new Error("private technical detail");
  return <Button onClick={() => crash(true)}>Trigger render failure</Button>;
}
function UpdateFixture() {
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const [ready, setReady] = useState(true);
  const mode = new URLSearchParams(location.search).get("updateBar");
  const update = ready ? <CompleteUpdateButton onClick={() => setReady(false)} /> : undefined;
  return <SoundToolsProvider colorScheme={mode === "soundglow" ? "dark" : "light"}><PracticeOptionsProvider entries={[]}>
    {mode === "soundglow" ? <header className="soundglow-header soundtools-ui"><span>Soundglow</span><button>Settings</button>{update && <UpdateBar>{update}</UpdateBar>}</header> :
      <ApplicationLayout brand="Test" title="Practice" area="Music" navigation={<span>Exercises</span>} navigationOpen={false} navigationCollapsed={navigationCollapsed} onNavigationOpen={() => {}} onNavigationClose={() => {}} onNavigationCollapse={() => setNavigationCollapsed(true)} onNavigationExpand={() => setNavigationCollapsed(false)} compact={mode !== "dorego"} toolbarOnly={mode !== "dorego"} mobileToolbarHeight={mode === "songalong" ? 104 : 56} headerActions={<button>Practice controls</button>} updateAction={update}><p>Practice content</p></ApplicationLayout>}
  </PracticeOptionsProvider></SoundToolsProvider>;
}
const recovery = new URLSearchParams(location.search);
createRoot(document.getElementById("root")!).render(
  recovery.has("updateBar") ? <UpdateFixture /> : recovery.has("recovery") ? (
    <RenderErrorBoundary
      appName="Test app"
      dark={recovery.has("dark")}
      onStop={() => {
        sessionStorage.setItem(
          "shutdowns",
          String(Number(sessionStorage.getItem("shutdowns")) + 1),
        );
        if (recovery.has("stopFails")) throw new Error("shutdown failed");
      }}
      onError={() => {
        sessionStorage.setItem(
          "reports",
          String(Number(sessionStorage.getItem("reports")) + 1),
        );
        if (recovery.has("reportFails")) throw new Error("report failed");
      }}
    >
      <SoundToolsProvider>
        <Crashable />
      </SoundToolsProvider>
    </RenderErrorBoundary>
  ) : (
    <Controls />
  ),
);
