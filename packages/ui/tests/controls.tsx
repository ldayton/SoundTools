import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, Stack } from "@mantine/core";
import { SoundToolsProvider } from "../provider";
import { CommittedNumber } from "../committed-number";
import { createViewState } from "../view-state";
import {
  PracticeView,
  PracticeTitle,
  PracticeVolume,
} from "../../../apps/dorego/src/practice-view";
import type { PracticeSnapshot } from "../../../apps/dorego/src/practice-view";
const practice = createViewState<PracticeSnapshot>({
  mode: "playing",
  warming: false,
  failed: false,
  error: null,
  title: "Practice",
  summary: "Test",
  bpm: 120,
  volume: -12,
  toast: "",
});
const playback = createViewState({ position: 0, duration: 100 });
let reads = 0;
const instrumented = {
  subscribe: practice.subscribe,
  getSnapshot: () => {
    reads++;
    return practice.getSnapshot();
  },
};
const stage = document.createElement("div");
window.clockTest = {
  reads: () => reads,
  advance: () =>
    playback.set({
      position: playback.getSnapshot().position + 1,
      duration: 100,
    }),
};
declare global {
  interface Window {
    clockTest: { reads(): number; advance(): void };
  }
}

function Controls() {
  const [integer, setInteger] = useState(120),
    [decimal, setDecimal] = useState(1.5);
  const [calls, setCalls] = useState(0),
    [reset, setReset] = useState(0);
  return (
    <SoundToolsProvider>
      <Stack p="md">
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
        <PracticeTitle model={instrumented} />
        <PracticeVolume model={instrumented} volume={() => {}} />
        <PracticeView
          model={instrumented}
          playback={playback}
          stage={stage}
          play={() => {}}
          restart={() => {}}
          seek={() => {}}
          tempo={() => {}}
        />
      </Stack>
    </SoundToolsProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Controls />);
