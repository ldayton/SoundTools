// SPDX-License-Identifier: GPL-3.0-or-later
import { useSyncExternalStore } from "react";
import {
  ActionIcon,
  Button,
  Checkbox,
  Divider,
  Group,
  NativeSelect,
  Stack,
} from "@mantine/core";
import { createViewState } from "@ldayton/ui/view-state";
import { VolumeControl } from "@ldayton/ui/volume-control";
type View = {
  playing: boolean;
  loading: boolean;
  loop: boolean;
  zoomed: boolean;
  canZoomIn: boolean;
  rate: number;
  volume: number;
};
type Actions = {
  play(): void;
  restart(): void;
  back(): void;
  forward(): void;
  loop(enabled: boolean): void;
  zoom(factor: number): void;
  showAll(): void;
  rate(value: number): void;
  volume(value: number): void;
};
export function createFileControls() {
  const model = createViewState<View>({
    playing: false,
    loading: false,
    loop: false,
    zoomed: false,
    canZoomIn: true,
    rate: 1,
    volume: 1,
  });
  const time = createViewState("0:00 / 0:00");
  let actions: Actions | undefined;
  const useView = () =>
    useSyncExternalStore(model.subscribe, model.getSnapshot);
  function Playback() {
    const view = useView();
    return (
      <Group gap="xs" className="soundtools-ui" mt="sm">
        <ActionIcon
          id="fileRestart"
          variant="default"
          size="lg"
          aria-label="Restart recording"
          disabled={view.loading}
          onClick={() => actions?.restart()}
        >
          ↤
        </ActionIcon>
        <Button
          id="fileBack"
          variant="default"
          aria-label="Back 5 seconds"
          disabled={view.loading}
          onClick={() => actions?.back()}
        >
          −5s
        </Button>
        <Button
          id="filePlay"
          aria-label={view.playing ? "Pause recording" : "Play recording"}
          disabled={view.loading}
          onClick={() => actions?.play()}
        >
          {view.playing ? "Pause" : "Play"}
        </Button>
        <Button
          id="fileForward"
          variant="default"
          aria-label="Forward 5 seconds"
          disabled={view.loading}
          onClick={() => actions?.forward()}
        >
          +5s
        </Button>
        <Checkbox
          id="fileLoop"
          label="Loop"
          checked={view.loop}
          disabled={view.loading}
          onChange={(event) => actions?.loop(event.currentTarget.checked)}
        />
        <Divider orientation="vertical" />
        <ActionIcon
          id="waveformZoomOut"
          variant="default"
          size="lg"
          aria-label="Zoom out waveform"
          disabled={!view.zoomed || view.loading}
          onClick={() => actions?.zoom(2)}
        >
          −
        </ActionIcon>
        <ActionIcon
          id="waveformZoomIn"
          variant="default"
          size="lg"
          aria-label="Zoom in waveform"
          disabled={!view.canZoomIn || view.loading}
          onClick={() => actions?.zoom(0.5)}
        >
          +
        </ActionIcon>
        <Button
          id="waveformShowAll"
          variant="default"
          disabled={!view.zoomed || view.loading}
          onClick={() => actions?.showAll()}
        >
          Show all
        </Button>
      </Group>
    );
  }
  function Options() {
    const view = useView();
    return (
      <Stack gap="md">
        <NativeSelect
          id="fileSpeed"
          label="Speed"
          value={String(view.rate)}
          disabled={view.loading}
          onChange={(event) => actions?.rate(Number(event.currentTarget.value))}
          data={[0.5, 0.75, 1, 1.25, 1.5].map((value) => ({
            value: String(value),
            label: `${value}×`,
          }))}
        />
        <VolumeControl
          id="fileVolume"
          value={Math.round(view.volume * 100)}
          onChange={(value) => actions?.volume(value / 100)}
        />
      </Stack>
    );
  }
  function Time() {
    const value = useSyncExternalStore(time.subscribe, time.getSnapshot);
    return <output id="fileTime">{value}</output>;
  }
  return {
    Playback,
    Options,
    Time,
    connect(next: Actions) {
      actions = next;
    },
    publish(next: View, readout: string) {
      const previous = model.getSnapshot();
      if (
        Object.entries(next).some(
          ([key, value]) => previous[key as keyof View] !== value,
        )
      )
        model.set(next);
      if (readout !== time.getSnapshot()) time.set(readout);
    },
  };
}
