import { useSyncExternalStore } from 'react';
import { ActionIcon, Alert, Button, Group, Slider, Stack, Text, Title } from '@mantine/core';
import { RetainedContent } from './app-shell';
import { CommittedNumber } from './builder';
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
  const stepTempo = (direction: number) =>
    tempo(
      Math.max(
        60,
        Math.min(
          240,
          direction > 0 ? (Math.floor(state.bpm / 5) + 1) * 5 : (Math.ceil(state.bpm / 5) - 1) * 5
        )
      )
    );
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
              <ActionIcon
                id="restart"
                variant="default"
                size="lg"
                title="Restart exercise"
                aria-label="Restart exercise"
                onClick={restart}
              >
                ↺
              </ActionIcon>
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
            <div className="dorego-tempo">
              <Group gap="xs" align="end" wrap="nowrap">
                <ActionIcon
                  id="tempo-down"
                  variant="default"
                  size="lg"
                  aria-label="Decrease tempo by 5 BPM"
                  disabled={state.bpm <= 60}
                  onClick={() => stepTempo(-1)}
                >
                  −
                </ActionIcon>
                <CommittedNumber
                  id="bpm"
                  label="Tempo"
                  aria-label="Tempo in beats per minute"
                  value={state.bpm}
                  min={60}
                  max={240}
                  step={5}
                  hideControls
                  change={tempo}
                />
                <ActionIcon
                  id="tempo-up"
                  variant="default"
                  size="lg"
                  aria-label="Increase tempo by 5 BPM"
                  disabled={state.bpm >= 240}
                  onClick={() => stepTempo(1)}
                >
                  +
                </ActionIcon>
              </Group>
              <Slider
                thumbProps={{ id: 'tempo-slider' }}
                thumbLabel="Tempo slider"
                thumbValueText={(value) => `${value} beats per minute`}
                min={60}
                max={240}
                step={5}
                value={state.bpm}
                onChange={tempo}
              />
            </div>
            <div>
              <Text component="label" size="sm" htmlFor="volume" mb={8}>
                Volume
              </Text>
              <Slider
                thumbProps={{ id: 'volume' }}
                thumbLabel="Volume"
                thumbValueText={(value) => `${value} decibels`}
                min={-36}
                max={0}
                step={1}
                value={state.volume}
                label={(value) => `${value} dB`}
                onChange={volume}
              />
            </div>
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
