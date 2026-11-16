import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, Stack } from "@mantine/core";
import { SoundToolsProvider } from "../provider";
import { RenderErrorBoundary } from "../render-error-boundary";
import { PitchField } from "../pitch-field";
import { CommittedNumber } from "../committed-number";
import { createViewState } from "../view-state";
import {
  PracticeView,
  PracticeToolbar,
} from "../../../apps/dorego/src/practice-view";
import type { PracticeSnapshot } from "../../../apps/dorego/src/practice-view";
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
const piano = createViewState({ low: 48, high: 83, root: 60, voices: [] });
let reads = 0;
const instrumented = {
  subscribe: practice.subscribe,
  getSnapshot: () => {
    reads++;
    return practice.getSnapshot();
  },
};
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
    clockTest: { reads(): number; advance(): void };
  }
}

function Controls() {
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
        <PracticeToolbar
          model={instrumented}
          playback={playback}
          play={() => {}}
          restart={() => {}}
          tempo={() => {}}
          volume={() => {}}
          moveRound={() => {}}
        />
        <PracticeView
          model={instrumented}
          playback={playback}
          piano={piano}
          audition={() => () => {}}
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
const recovery = new URLSearchParams(location.search);
createRoot(document.getElementById("root")!).render(
  recovery.has("recovery") ? (
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
