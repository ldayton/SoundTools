import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActionIcon, Alert, Button, Group, Text, Title } from '@mantine/core';
import { RetainedContent } from '@ldayton/ui/retained-content';
import { ControlIcon } from '@ldayton/ui/control-icon';
import { CommittedNumber } from '@ldayton/ui/committed-number';
import { ToolbarSlider } from '@ldayton/ui/toolbar-slider';
import { PianoKeyboard } from '@ldayton/ui/piano-keyboard';
import type { PianoVoice } from '@ldayton/ui/piano-motion';
import { volumePercent, volumeDecibels } from '@ldayton/ui/volume';
import { formatTime, noteName } from './music';
import { referenceRows, referenceWindow, referenceOctaves } from './keyboard-layout';
import { useMediaQuery } from '@mantine/hooks';
export type PracticeSnapshot = {
  mode: 'ready' | 'starting' | 'playing' | 'paused' | 'complete';
  warming: boolean;
  failed: boolean;
  error: string | null;
  title: string;
  bpm: number;
  volume: number;
  toast: string;
};
interface SnapshotModel<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}
export type PracticeModel = SnapshotModel<PracticeSnapshot>;
export type PlaybackSnapshot = {
  position: number;
  duration: number;
  round: number;
  rounds: number;
};
export type PlaybackModel = SnapshotModel<PlaybackSnapshot>;
export type PianoSnapshot = { low: number; high: number; root: number; voices: PianoVoice[] };
export type PianoModel = SnapshotModel<PianoSnapshot>;

export function PracticeToolbar({
  model,
  playback,
  play,
  restart,
  tempo,
  volume,
  moveRound,
}: {
  model: PracticeModel;
  playback: PlaybackModel;
  play(): void;
  restart(): void;
  tempo(value: number): void;
  volume(value: number): void;
  moveRound(step: number): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const playing = state.mode === 'playing' || state.mode === 'starting';
  const label = state.warming
    ? 'Loading audio'
    : state.failed
      ? 'Retry audio'
      : playing
        ? 'Pause'
        : state.mode === 'paused'
          ? 'Resume'
          : state.mode === 'complete'
            ? 'Replay'
            : 'Play';
  const percent = volumePercent(state.volume);
  return (
    <div className="dorego-toolbar">
      <ToolbarSlider
        id="volume"
        label="Volume"
        value={percent}
        min={0}
        max={100}
        valueText={percent ? `${percent}%` : 'Muted'}
        onChange={(value) => volume(volumeDecibels(value))}
        icon={
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M11 4 6 8H3v8h3l5 4Z" />
            {percent ? (
              <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
            ) : (
              <path d="m16 9 6 6m0-6-6 6" />
            )}
          </svg>
        }
      />
      <Group
        className="dorego-transport"
        gap="xs"
        wrap="nowrap"
        role="group"
        aria-label="Playback controls"
      >
        <Group gap={4} wrap="nowrap">
          <Button
            id="restart"
            variant="default"
            aria-label="Go to start"
            title="Go to start"
            w={36}
            miw={36}
            px={0}
            onClick={restart}
          >
            <ControlIcon name="go-start" />
          </Button>
          <RoundButton
            model={playback}
            step={-1}
            move={moveRound}
            disabled={state.warming || !!state.error}
          />
          <Button
            id="play"
            autoContrast
            aria-label={label}
            title={label}
            w={36}
            miw={36}
            px={0}
            loading={state.warming}
            disabled={state.warming || !!state.error}
            aria-busy={state.warming}
            data-mode={state.warming ? 'warming' : state.failed ? 'failed' : state.mode}
            onClick={play}
          >
            <ControlIcon name={playing ? 'pause' : state.failed ? 'refresh' : 'play'} />
            <span className="sr-only">{label === 'Loading audio' ? 'Loading...' : label}</span>
          </Button>
          <RoundButton
            model={playback}
            step={1}
            move={moveRound}
            disabled={state.warming || !!state.error}
          />
        </Group>
        <Group className="dorego-tempo" gap={0} wrap="nowrap" role="group" aria-label="Tempo">
          <ActionIcon
            id="tempo-down"
            size={36}
            variant="subtle"
            aria-label="Decrease tempo by 5 BPM"
            disabled={state.bpm <= 60}
            onClick={() => tempo(Math.max(60, state.bpm - 5))}
          >
            −
          </ActionIcon>
          <ActionIcon
            id="tempo-up"
            size={36}
            variant="subtle"
            aria-label="Increase tempo by 5 BPM"
            disabled={state.bpm >= 240}
            onClick={() => tempo(Math.min(240, state.bpm + 5))}
          >
            +
          </ActionIcon>
          <div style={{ width: 96 }}>
            <CommittedNumber
              id="bpm"
              label="Tempo in beats per minute"
              hideLabel
              hideControls
              step={5}
              min={60}
              max={240}
              value={state.bpm}
              suffix=" BPM"
              change={tempo}
              styles={{
                input: {
                  border: 0,
                  borderRadius: 0,
                  textAlign: 'center',
                  paddingInline: 8,
                  fontVariantNumeric: 'tabular-nums',
                },
              }}
            />
          </div>
        </Group>
      </Group>
      <PlaybackTime model={playback} />
    </div>
  );
}

function RoundButton({
  model,
  step,
  move,
  disabled,
}: {
  model: PlaybackModel;
  step: number;
  move(step: number): void;
  disabled: boolean;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const label = step < 0 ? 'Previous round' : 'Next round';
  return (
    <Button
      id={step < 0 ? 'previous-round' : 'next-round'}
      variant="default"
      w={36}
      miw={36}
      px={0}
      aria-label={label}
      title={label}
      disabled={disabled || (step < 0 ? state.round <= 1 : state.round >= state.rounds)}
      onClick={() => move(step)}
    >
      <ControlIcon name={step < 0 ? 'chevron-left' : 'chevron-right'} />
    </Button>
  );
}

export function PracticeView({
  model,
  playback,
  piano,
  stage,
  audition,
}: {
  model: PracticeModel;
  playback: PlaybackModel;
  piano: PianoModel;
  stage: HTMLElement;
  audition(midi: number): () => void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <>
      <section className="workspace" aria-label="Practice studio">
        <div className="practice-surface practice-panel">
          <Title id="exercise-title" order={1} size="h3" ta="center" tabIndex={-1}>
            {state.title}
          </Title>
          <RoundProgress model={playback} />
          <div className="practice-card" id="practice-card">
            <RetainedContent element={stage} />
          </div>
          <ReferenceKeyboard model={piano} audition={audition} />
        </div>
      </section>
      <Alert id="toast" className="dorego-toast" role="status" hidden={!state.toast}>
        {state.toast}
      </Alert>
    </>
  );
}

function PlaybackTime({ model }: { model: PlaybackModel }) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <Text
      component="output"
      id="elapsed"
      className="dorego-time"
      size="sm"
      c="dimmed"
      aria-label="Elapsed time"
      data-seconds={Math.min(state.position, state.duration)}
      data-duration={state.duration}
    >
      {formatTime(Math.min(state.position, state.duration))} / {formatTime(state.duration)}
    </Text>
  );
}
function RoundProgress({ model }: { model: PlaybackModel }) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  return (
    <Text id="exercise-summary" size="xs" c="dimmed" ta="center" mt={4}>
      Round {state.round} of {state.rounds}
    </Text>
  );
}

function ReferenceKeyboard({
  model,
  audition,
}: {
  model: PianoModel;
  audition(midi: number): () => void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const mobile = useMediaQuery('(max-width:760px)', undefined, { getInitialValueInEffect: false });
  const range = referenceWindow(state.low, state.high, width);
  const rows = mobile
    ? referenceOctaves(state.low, state.high)
    : referenceRows(range[0], range[1], width);
  return (
    <div ref={host} className="dorego-piano">
      <PianoKeyboard
        rows={rows}
        voices={state.voices}
        label={(midi) => noteName(midi, state.root)}
        onPress={audition}
      />
    </div>
  );
}
