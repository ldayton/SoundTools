import { useSyncExternalStore } from 'react';
import { Checkbox, Stack, Text } from '@mantine/core';
import type { Exercise } from './music';
import type { PlaybackModel } from './practice-view';
import { ribbonGuides } from './voice-ribbon-model';
import { setVoiceFeedback, voiceFeedbackPoints, voiceFeedbackState } from './voice-feedback';
export function VoiceFeedbackOptions() {
  const state = useSyncExternalStore(voiceFeedbackState.subscribe, voiceFeedbackState.getSnapshot);
  return (
    <Stack gap="xs">
      <Checkbox
        id="voice-feedback"
        label="Voice feedback"
        checked={state.enabled}
        onChange={(event) => setVoiceFeedback(event.currentTarget.checked)}
      />
      {state.error && (
        <Text size="sm" c="red" role="alert">
          {state.error}
        </Text>
      )}
    </Stack>
  );
}
export function VoiceRibbon({
  playback,
  getExercise,
}: {
  playback: PlaybackModel;
  getExercise(): Exercise;
}) {
  const state = useSyncExternalStore(voiceFeedbackState.subscribe, voiceFeedbackState.getSnapshot);
  const position = useSyncExternalStore(playback.subscribe, playback.getSnapshot);
  if (!state.enabled) return null;
  const exercise = getExercise(),
    round = exercise.rounds[position.round - 1];
  const guides = ribbonGuides(exercise, position.round - 1);
  if (!round || !guides.length) return null;
  const pitches = guides.flatMap((guide) => guide.pitches);
  const low = Math.min(...pitches) - 1,
    high = Math.max(...pitches) + 1;
  const start = round.onsetBeat,
    end = round.endBeat;
  const x = (beat: number) => 12 + (576 * (beat - start)) / Math.max(0.01, end - start);
  const y = (midi: number) => 126 - ((midi - low) / Math.max(4, high - low)) * 112;
  let voice = '',
    lastSegment = -1;
  for (const point of voiceFeedbackPoints()) {
    if (point.beat < start || point.beat >= end || point.midi < low || point.midi > high) {
      lastSegment = -1;
      continue;
    }
    voice += `${point.segment === lastSegment ? 'L' : 'M'}${x(point.beat).toFixed(2)},${y(point.midi).toFixed(2)} `;
    lastSegment = point.segment;
  }
  return (
    <figure className="voice-ribbon" aria-label="Guide phrase and your sung pitch">
      <svg
        viewBox="0 0 600 140"
        role="img"
        aria-label="Pitch feedback: grey guide, green voice"
        preserveAspectRatio="none"
      >
        {guides.map((guide, i) => (
          <path
            key={i}
            className="voice-ribbon-guide"
            d={guide.pitches
              .map(
                (pitch, j) =>
                  `${j ? 'L' : 'M'}${x(guide.start + (guide.end - guide.start) * (0.08 + (0.84 * j) / (guide.pitches.length - 1)))},${y(pitch)}`
              )
              .join(' ')}
          />
        ))}
        <path className="voice-ribbon-voice" d={voice} />
      </svg>
      <figcaption>
        <span>
          <i />
          Guide
        </span>
        <span>
          <i />
          Your voice
        </span>
      </figcaption>
    </figure>
  );
}
