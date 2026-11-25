import { useMediaQuery } from '@mantine/hooks';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { ActionIcon, Alert, Button, Group, Text, Title } from '@mantine/core';
import { ControlIcon } from '@ldayton/ui/control-icon';
import { CommittedNumber } from '@ldayton/ui/committed-number';
import { ToolbarSlider } from '@ldayton/ui/toolbar-slider';
import type { PianoVoice } from '@ldayton/ui/piano-motion';
import { volumePercent, volumeDecibels } from '@ldayton/ui/volume';
import { formatTime, noteName } from './music';
export type PracticeSnapshot = {
  mode: 'ready' | 'starting' | 'playing' | 'paused' | 'complete';
  warming: boolean;
  failed: boolean;
  error: string | null;
  title: string;
  bpm: number;
  volume: number;
  toast: string;
  readout: ReadoutSnapshot | null;
};
export type RoundReadout = { note: string; range: string };
export type ReadoutSnapshot = {
  status: string;
  restCount?: number | null;
  countIn: { beat: number; bar: number; bars: number } | null;
  current: RoundReadout;
  next: RoundReadout | null;
  description: string;
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
export type PianoSnapshot = {
  low: number;
  high: number;
  root: number;
  pitches: number[];
  labels: Record<string, string>;
  voices: PianoVoice[];
};
export type PianoModel = SnapshotModel<PianoSnapshot>;

export function PracticeVolume({
  model,
  volume,
}: {
  model: PracticeModel;
  volume(value: number): void;
}) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const percent = volumePercent(state.volume);
  return (
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
  );
}

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
  return (
    <div className="dorego-toolbar">
      <PracticeVolume model={model} volume={volume} />
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
  audition,
  repeatRound,
  controls,
}: {
  model: PracticeModel;
  playback: PlaybackModel;
  piano: PianoModel;
  controls?: ReactNode;
  audition(midi: number): () => void;
  repeatRound(): void;
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
          {controls}
          <div className="practice-card" id="practice-card">
            {state.readout && <PracticeReadout state={state.readout} />}
            <div className="repeat-round-control">
              <Button id="repeat-round" size="md" radius="xl" aria-label="Repeat round" title="Repeat round" disabled={state.warming || state.failed || !!state.error} onClick={repeatRound}>
                {/* Phosphor Repeat Bold, MIT; license in public/phosphor-icons-LICENSE.txt. */}
                <svg width="36" height="36" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">
                  <path d="M20,128A76.08,76.08,0,0,1,96,52h99l-3.52-3.51a12,12,0,1,1,17-17l24,24a12,12,0,0,1,0,17l-24,24a12,12,0,0,1-17-17L195,76H96a52.06,52.06,0,0,0-52,52,12,12,0,0,1-24,0Zm204-12a12,12,0,0,0-12,12,52.06,52.06,0,0,1-52,52H61l3.52-3.51a12,12,0,1,0-17-17l-24,24a12,12,0,0,0,0,17l24,24a12,12,0,1,0,17-17L61,204h99a76.08,76.08,0,0,0,76-76A12,12,0,0,0,224,116Z" />
                </svg>
              </Button>
            </div>
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

function PitchName({ value }: { value: string }) {
  const note = /^([A-G])([♯♭𝄲𝄳]?)(-?\d+)$/u.exec(value);
  return (
    <span className="pitch-name">
      {note ? (
        <>
          <span className="pitch-letter">{note[1]}</span>
          {note[2] && (
            <span className="pitch-accidental" data-microtonal={/[𝄲𝄳]/u.test(note[2]) || undefined}>
              {note[2]}
            </span>
          )}
          <span className="pitch-octave">{note[3]}</span>
        </>
      ) : (
        value
      )}
    </span>
  );
}
function PracticeReadout({ state }: { state: ReadoutSnapshot }) {
  return (
    <div
      id="stage"
      className="practice-readout"
      role="group"
      aria-label={state.description}
      data-counting={!!state.countIn}
    >
      <Text component="div" className="practice-status">
        <span className="practice-status-label">{state.status || '\u00a0'}</span>
        {state.restCount != null && (
          <>
            {' '}
            <span className="round-count">{state.restCount}</span>
          </>
        )}
      </Text>
      {state.countIn && (
        <div className="practice-count-in">
          <span className="practice-count-beat" data-downbeat={state.countIn.beat === 1}>
            {state.countIn.beat}
          </span>
          <Text size="sm" c="dimmed">
            Bar {state.countIn.bar} of {state.countIn.bars}
          </Text>
        </div>
      )}
      <div className="practice-note-pair">
        {(['current', 'next'] as const).map((kind) => (
          <div className={`practice-pitch ${kind}`} key={kind}>
            <Text component="div" className="practice-pitch-label">
              {kind === 'current' ? 'Current' : 'Next'}
            </Text>
            <div className="practice-pitch-value">
              <PitchName value={state[kind]?.note ?? '—'} />
            </div>
            <Text component="div" className="practice-pitch-range">
              {state[kind]?.range || '\u00a0'}
            </Text>
          </div>
        ))}
      </div>
      <span id="note-announcement" className="sr-only" aria-live="polite">
        {state.description}
      </span>
    </div>
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
  const gestures = useRef(new Map<string, { midi: number; stop(): void }>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [held, setHeld] = useState<number[]>([]);
  const [focus, setFocus] = useState<number | null>(null);
  const desktop = useMediaQuery('(min-width:768px)', undefined, { getInitialValueInEffect: false });
  const columns = desktop
    ? Math.max(1, Math.min(6, state.pitches.length))
    : state.pitches.length <= 5
      ? Math.max(1, state.pitches.length)
      : 4;
  const signature = state.pitches.join(',');
  const refresh = () =>
    setHeld([...new Set([...gestures.current.values()].map((gesture) => gesture.midi))]);
  const release = (id: string) => {
    gestures.current.get(id)?.stop();
    gestures.current.delete(id);
    refresh();
  };
  const clear = () => {
    for (const gesture of gestures.current.values()) gesture.stop();
    gestures.current.clear();
    for (const timer of timers.current) clearTimeout(timer);
    timers.current.clear();
    refresh();
  };
  useEffect(() => {
    const keyup = (event: KeyboardEvent) => release(`key:${event.key}`);
    const visibility = () => {
      if (document.hidden) clear();
    };
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', clear);
    window.addEventListener('pagehide', clear);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', clear);
      window.removeEventListener('pagehide', clear);
      document.removeEventListener('visibilitychange', visibility);
      clear();
    };
  }, [signature]);
  const press = (id: string, midi: number) => {
    release(id);
    gestures.current.set(id, { midi, stop: audition(midi) });
    refresh();
  };
  const focusPitch = focus !== null && state.pitches.includes(focus) ? focus : state.pitches[0];
  return (
    <section
      className="note-instrument"
      aria-label="Exercise instrument"
      style={{ '--pad-columns': columns } as CSSProperties}
    >
      <div
        ref={host}
        className="dorego-piano dorego-note-pads"
        role="group"
        aria-label="Exercise note pads"
        style={
          {
            gridTemplateColumns: `repeat(${columns * 2}, minmax(0, 1fr))`,
            '--pad-columns': columns,
          } as CSSProperties
        }
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
      >
        {state.pitches.map((midi, index) => {
          const playing = state.voices.some((voice) => voice.pitch === midi);
          return (
            <button
              key={midi}
              type="button"
              style={{
                gridRow: Math.floor(index / columns) + 1,
                gridColumn: `${(index % columns) * 2 + 1 + (Math.floor(index / columns) === Math.floor((state.pitches.length - 1) / columns) && state.pitches.length % columns ? columns - (state.pitches.length % columns) : 0)} / span 2`,
              }}
              data-piano={midi}
              data-quarter-tone={!Number.isInteger(midi) ? midi : undefined}
              className={`note-pad piano-key${playing ? ' is-playing' : ''}${held.includes(midi) ? ' is-held' : ''}`}
              aria-label={state.labels[midi] ?? noteName(midi, state.root)}
              aria-pressed={held.includes(midi)}
              tabIndex={midi === focusPitch ? 0 : -1}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                press(`pointer:${event.pointerId}`, midi);
              }}
              onPointerUp={(event) => {
                release(`pointer:${event.pointerId}`);
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={(event) => release(`pointer:${event.pointerId}`)}
              onLostPointerCapture={(event) => release(`pointer:${event.pointerId}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!event.repeat) press(`key:${event.key}`, midi);
                  return;
                }
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? state.pitches.length - 1
                      : event.key === 'ArrowRight'
                        ? index + 1
                        : event.key === 'ArrowLeft'
                          ? index - 1
                          : event.key === 'ArrowDown'
                            ? index + columns
                            : event.key === 'ArrowUp'
                              ? index - columns
                              : null;
                if (next !== null) {
                  event.preventDefault();
                  const pitch =
                    state.pitches[Math.max(0, Math.min(state.pitches.length - 1, next))];
                  setFocus(pitch);
                  host.current
                    ?.querySelector<HTMLButtonElement>(`[data-piano="${pitch}"]`)
                    ?.focus();
                }
              }}
              onClick={(event) => {
                if (event.detail !== 0) return;
                press('activation', midi);
                const timer = setTimeout(() => {
                  timers.current.delete(timer);
                  release('activation');
                }, 150);
                timers.current.add(timer);
              }}
            >
              <span className="piano-note-label">
                <PitchName value={state.labels[midi] ?? noteName(midi, state.root)} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
