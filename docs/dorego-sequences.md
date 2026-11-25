# DoReGo exercises, sequences, and rounds

An **exercise** supplies musical content. A **sequence** is a run of that
exercise. Each **round** is one complete phrase at its selected pitch.

`apps/dorego/src/sequence.ts` owns settings timing and sequence edits for every
exercise. Its pure transition function returns a new timeline and a playback
instruction. Musical generators remain reusable for exports; they do not own
live edit behavior.

Each timeline round carries a stable identity, musical anchor, pass, progression
leg, and committed settings. An edit preserves all completed rounds and the
current round, including their note identities. Only the uncommitted future is
regenerated. The musical cursor, rather than an array index, selects the
continuation. Removing the active pitch from the valid range, or reducing the
pass count below the current pass, finishes the current round and ends naturally.
When an inter-round rest has begun, its duration and destination are committed.

The exhaustive `optionTiming` map is the single policy for settings:

- Selecting a different sidebar exercise resets the sequence. Its identity is
  centralized in `exerciseFamily`; note counts, pentatonic variants and glide
  intervals remain options within their exercise.
- Count-in applies to a fresh sequence, including explicit Restart.
- Tempo, volume, and the existing live tonic-drone mixer preserve playback and
  apply immediately.
- Other options update future rounds. Paused edits stay paused; completed
  sequences do not start themselves after edits.

`main.ts` sends local and restored settings through this same transition.
`audio.ts` executes its instructions without replacing the audio graph or clock.
It cancels only future sources and retains committed event identities. Sample
preparation happens ahead of future rounds; if preparation is delayed, the
musical clock holds at the next boundary while the audio clock remains monitored.
Restart generates a fresh sequence from current settings. Repeat replays the
committed round using the latest inter-round rest.

Timing, duration, previews, keyboard pitches and round counts derive from the
same timeline. Count-in remains the count-in committed at sequence start.
Current-round keyboard content reads its own settings snapshot, so future chord
edits cannot change the current phrase display.

## Regression ownership

- `apps/dorego/tests/sequence.test.ts`: pure transitions across every registered
  exercise; immutable history/current round, stable event identities, range,
  traversal, passes, rapid edits, rests, count-in, tempo, pause and completion.
- `apps/dorego/tests/tempo-clock.test.ts`: held boundaries and retained clock history.
- `apps/dorego/tests/sequence.browser.ts`, called by the existing required desktop
  suite: a real sustained source survives option edits; future samples can be
  delayed; the next round receives new chords/rest; count-in waits for Restart.
- Existing desktop, lifecycle, workspace, account and offline suites retain their
  transport, persistence and restoration responsibilities.

The unit glob and existing desktop command enroll these checks in CI without
adding a runner alias or duplicating the exercise matrix in browsers.
