import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Alert, Button, Group, Stack, Text, Title } from '@mantine/core';
import { BreathMetronome } from './breath-metronome';
import { diagnostics } from './diagnostics';
import { CommittedNumber } from '@ldayton/ui/committed-number';
import { ControlIcon } from '@ldayton/ui/control-icon';
import { formatTime } from './music';
import { BREATH_STEPS, breathAt, createBreathSession, type BreathSession } from './breath-squares';

export function useBreathSession(enabled: boolean, getVolume: () => number) {
  const [session] = useState(() => {
    let settings: unknown;
    try {
      settings = JSON.parse(localStorage.getItem('dorego.breathSquares') || 'null');
    } catch {}
    return createBreathSession(settings);
  });
  useEffect(() => {
    let previous = session.getSnapshot().settings;
    return session.subscribe(() => {
      const next = session.getSnapshot().settings;
      if (next === previous) return;
      previous = next;
      try {
        localStorage.setItem('dorego.breathSquares', JSON.stringify(next));
      } catch {}
    });
  }, [session]);
  useEffect(() => {
    if (!enabled) {
      session.pause();
      return;
    }
    const metronome = new BreathMetronome(getVolume, (error) => {
      session.audioFailed();
      diagnostics.capture(error, 'breathing.audio_failed');
    });
    const unsubscribe = session.subscribe(() => metronome.sync(session.getSnapshot()));
    const interval = setInterval(session.tick, 50);
    const hide = () => {
      if (document.hidden) session.pause();
    };
    const key = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target as HTMLElement).closest(
          'a, input, select, textarea, button, [role="dialog"], [role="slider"], [role="spinbutton"]'
        ) ||
        document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        session.toggle();
      } else if (event.key.toLowerCase() === 'r') session.reset();
    };
    document.addEventListener('keydown', key);
    document.addEventListener('visibilitychange', hide);
    document.addEventListener('freeze', session.pause);
    window.addEventListener('pagehide', session.pause);
    return () => {
      clearInterval(interval);
      document.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', hide);
      document.removeEventListener('freeze', session.pause);
      window.removeEventListener('pagehide', session.pause);
      session.pause();
      unsubscribe();
      metronome.dispose();
    };
  }, [enabled, session, getVolume]);
  return session;
}
export function BreathOptions({ session }: { session: BreathSession }) {
  const { settings } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return (
    <Stack gap="md">
      <CommittedNumber
        id="breath-rounds"
        label="Rounds"
        min={1}
        max={100}
        value={settings.rounds}
        change={(rounds) => session.configure({ ...settings, rounds })}
      />
      <CommittedNumber
        id="breath-seconds"
        label="Seconds per step"
        min={1}
        max={60}
        value={settings.seconds}
        change={(seconds) => session.configure({ ...settings, seconds })}
      />
    </Stack>
  );
}
export function BreathToolbar({
  session,
  volumeControl,
}: {
  session: BreathSession;
  volumeControl: ReactNode;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const label =
    state.mode === 'playing'
      ? 'Pause'
      : state.mode === 'paused'
        ? 'Resume'
        : state.mode === 'complete'
          ? 'Replay'
          : 'Play';
  return (
    <div className="dorego-toolbar">
      {volumeControl}
      <Group className="dorego-transport" gap={4} wrap="nowrap" aria-label="Breathing controls">
        <Button
          id="breath-restart"
          variant="default"
          aria-label="Go to start"
          title="Go to start"
          w={36}
          miw={36}
          px={0}
          onClick={session.reset}
        >
          <ControlIcon name="go-start" />
        </Button>
        <Button
          id="breath-play"
          aria-label={label}
          title={label}
          w={36}
          miw={36}
          px={0}
          autoContrast
          onClick={session.toggle}
        >
          <ControlIcon name={state.mode === 'playing' ? 'pause' : 'play'} />
        </Button>
      </Group>
      <Text
        component="output"
        className="dorego-time"
        size="sm"
        c="dimmed"
        aria-label="Elapsed time"
      >
        {formatTime(state.position)} / {formatTime(breathAt(state).duration)}
      </Text>
    </div>
  );
}
export function BreathSquares({ session }: { session: BreathSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const at = breathAt(state);
  return (
    <section
      id="breath-squares"
      className="practice-panel breath-panel"
      aria-label="Breath Squares"
    >
      <Title id="exercise-title" order={1} size="h3" ta="center" tabIndex={-1}>
        Breath Squares
      </Title>
      <Text ta="center" size="sm" c="dimmed" mt="xs">
        Round {at.round} of {state.settings.rounds}
      </Text>
      <Alert color="red" hidden={!state.error} mt="md">
        {state.error}
      </Alert>
      <Text ta="center" size="sm" c="dimmed" className="breath-status" role="status">
        {state.mode === 'ready'
          ? 'Ready'
          : state.mode === 'complete'
            ? 'Complete'
            : state.mode === 'paused'
              ? 'Paused'
              : '\u00a0'}
      </Text>
      <div className="breath-grid" role="list" aria-label="Clockwise breathing steps">
        {BREATH_STEPS.map((label, phase) => {
          const active = at.active && at.phase === phase;
          const moving = phase === 0 || phase === 2;
          const scale = phase === 0 ? 0.35 + 0.65 * at.progress : 1 - 0.65 * at.progress;
          return (
            <div
              key={phase}
              role="listitem"
              className="breath-cell"
              data-phase={phase}
              data-active={active || undefined}
              aria-label={`${phase + 1}. ${label}`}
              aria-current={active ? 'step' : undefined}
            >
              {active && (
                <>
                  {moving && (
                    <div
                      className="breath-orb"
                      aria-hidden="true"
                      style={{ transform: `scale(${scale})` }}
                    />
                  )}
                  <Text className="breath-label" fw={600}>
                    {label}
                  </Text>
                  <Text
                    className="breath-countdown"
                    component="output"
                    aria-label="Seconds remaining"
                  >
                    {at.remaining}
                  </Text>
                </>
              )}
            </div>
          );
        })}
      </div>
      <span className="sr-only" aria-live="polite">
        {at.active ? `Round ${at.round}. ${BREATH_STEPS[at.phase]}.` : ''}
      </span>
    </section>
  );
}
