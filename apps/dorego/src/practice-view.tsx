import { useSyncExternalStore } from 'react';
import { Alert, Button, Group, Slider, Stack, Text, Title } from '@mantine/core';
import { RetainedContent } from './app-shell';
import { TempoControl } from '@ldayton/ui/tempo-control';
import { VolumeControl } from '@ldayton/ui/volume-control';
import { volumePercent, volumeDecibels } from '@ldayton/ui/volume';
import { formatTime } from './music';
export type PracticeSnapshot = {
  mode: 'ready' | 'starting' | 'playing' | 'paused' | 'complete';
  warming: boolean;
  failed: boolean;
  error: string | null;
  title: string;
  summary: string;
  bpm: number;
  volume: number;
  position: number;
  duration: number;
  toast: string;
};
export interface PracticeModel {
  getSnapshot(): PracticeSnapshot;
  subscribe(listener: () => void): () => void;
}
export function PracticeView({
  model,
  stage,
  play,
  restart,
  seek,
  tempo,
  volume,
}: {
  model: PracticeModel;
  stage: HTMLElement;
  play(): void;
  restart(): void;
  seek(value: number): void;
  tempo(value: number): void;
  volume(value: number): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const playing = state.mode === 'playing' || state.mode === 'starting';
  const label = state.warming
    ? 'Loading...'
    : state.failed
      ? 'Retry audio'
      : playing
        ? 'Pause'
        : state.mode === 'paused'
          ? 'Resume'
          : state.mode === 'complete'
            ? 'Replay'
            : 'Play';
  return (
    <>
      <section className="workspace" aria-label="Practice studio">
        <div className="exercise-heading">
          <Title order={2} id="exercise-title">
            {state.title}
          </Title>
        </div>
        <div className="practice-panel">
          <div className="practice-card" id="practice-card">
            <RetainedContent element={stage} />
          </div>
          <Stack
            className="dorego-playback"
            p="md"
            gap="md"
            role="group"
            aria-label="Exercise playback controls"
          >
            <Group gap="sm" wrap="nowrap">
              <Button id="restart" variant="default" onClick={restart}>
                Start again
              </Button>
              <Button
                id="play"
                autoContrast
                loading={state.warming}
                disabled={state.warming || !!state.error}
                aria-busy={state.warming}
                data-mode={state.warming ? 'warming' : state.failed ? 'failed' : state.mode}
                onClick={play}
              >
                {label}
              </Button>
              <div className="dorego-seek">
                <Slider
                  thumbProps={{ id: 'position' }}
                  thumbLabel="Playback position"
                  thumbValueText={formatTime}
                  min={0}
                  max={Math.max(0.01, state.duration)}
                  step={0.01}
                  value={Math.min(state.position, state.duration)}
                  label={formatTime}
                  onChange={seek}
                />
                <Group justify="space-between" mt={4}>
                  <Text id="elapsed" size="xs" c="dimmed">
                    {formatTime(Math.min(state.position, state.duration))}
                  </Text>
                  <Text id="duration" size="xs" c="dimmed">
                    {formatTime(state.duration)}
                  </Text>
                </Group>
              </div>
            </Group>
            <TempoControl
              id="bpm"
              value={state.bpm}
              min={60}
              max={240}
              onChange={tempo}
              decreaseId="tempo-down"
              increaseId="tempo-up"
              sliderId="tempo-slider"
            />
            <VolumeControl
              id="volume"
              value={volumePercent(state.volume)}
              onChange={(value) => volume(volumeDecibels(value))}
            />
            <Text id="exercise-summary" size="xs" c="dimmed">
              {state.summary}
            </Text>
          </Stack>
        </div>
      </section>
      <Alert id="toast" className="dorego-toast" role="status" hidden={!state.toast}>
        {state.toast}
      </Alert>
    </>
  );
}
