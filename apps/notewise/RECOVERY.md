# Local practice checkpoints

Practice is local to the browser profile and origin. There is no account or cloud sync.

## Durable boundary

`durable-state.ts` defines the versioned root, migration, immutable save queue, and IndexedDB adapter. One `state/root` record contains preferences, review statistics, and all activity snapshots. A grading transition updates history and the round in the same strict IndexedDB transaction. The status changes from “Saving” to “Saved” only after transaction completion. A terminated process can lose an uncommitted transition; it cannot leave a saved grade without its matching checkpoint.

`persistence.ts` coordinates browser ownership, lifecycle, and visible storage errors. Web Locks allows one writer per origin. Other windows display the saved checkpoint read-only and ask the user to close the owner and reload. Every write also compares the revision and owner inside the IndexedDB transaction; notifications alone never authorize writes. Crash/close releases the browser lock, and a new owner fences delayed writes from the previous owner. Back/forward-cache restoration reloads to acquire ownership afresh. This intentionally favors a simple single writer over merging concurrent answers.

Activity logic stays in its existing modules:

- `PracticeSession` snapshots the exact card, phase, counts, score, recency, visits, retry schedule, draws, notation variant, and feedback. Cards are validated against the current pool. Round length belongs to the checkpoint. New questions use injected random/time inputs; the already-selected question never depends on rerender randomness.
- Hymns keep independent bookmarks for piece, arrangement, section length, and section, plus the last section for each selection. A bookmark includes the arranged ABC, matching-step content, matcher version, and step count; a changed score restarts safely instead of applying an old index. Pause and completion survive reopening. Held notes and partial chords do not.
- Patterns retain the exact generated pitches, settings, position, and pause/completion.
- Rhythm retains the generated bars, settings, and completed result. An interrupted timed attempt returns to a fresh count-in for the same bars; wall-clock timers and partially played timing attempts are deliberately not resumed.

Normal answer feedback still advances after its existing delay while focused. Restored feedback waits for **Next question**, without recording another answer. Switching activities saves the departing activity and restores the destination. **Start round again** explicitly discards the current round while keeping review history; **Keep going** retains selection context.

## Migration and failures

The old preferences/history key and hymn/pattern/rhythm keys are read once when the IndexedDB root is created. Their original values remain in localStorage, and migration input is retained in the root. New versions never mirror writes back into old keys. An old hymn bookmark lacks a content identifier, so its piece/arrangement preferences migrate but the section starts at the beginning with a visible explanation; its original index remains preserved for inspection.

Writes from an older open tab cannot overwrite the new root; a storage event stops the new writer and tells the user to close older tabs. Old and new histories are not silently merged. Older builds cannot understand the new database, so rollback to an old build can only see the retained legacy data, not subsequent practice. Root/activity versions newer than supported block writes. Invalid flashcard checkpoints are retained under a recovery entry with an explanation before starting a fresh round. Storage denial, quota errors, transaction failure, or missing ownership support disable practice with an explicit recovery message rather than claim that progress was saved.

Explicit and automatic offline-release updates first freeze input and drain queued saves. MIDI ports, permission requests, held notes, partial chords, focus, timers, and audio are reconstructed, never serialized. After reload the UI offers a real MIDI connection rather than pretending a device stayed connected.

## Validation

The recovery tests were written first: the initial browser run failed because reload changed the notation; the initial domain run failed before snapshot/persistence support existed. Test logs are in ignored `work/recovery-*.log`.

- `npm test --workspace=notewise`: snapshot round trips, feedback once, completion, selection context, independent round lengths, migration, bad versions, bookmarks, atomic state, queue failures, and stale writers.
- `npm run test:recovery --workspace=notewise`: real browser reload/reopen, exact notation, feedback, activity switching, hymn/pattern/rhythm recovery, multiple windows, actual IndexedDB compare-and-swap, quota failure UI, and old-tab migration conflicts; run with the Vite dev server at port 4320. `BROWSER=firefox` or `BROWSER=webkit` selects another engine.
- Existing piano, MIDI, hymn, practice, key-signature, and offline suites cover the unchanged musical behaviors and release A-to-B checkpoint recovery.

Interactive Chrome testing uses the separate local preview origin at port 4322, never installed production storage. Physical GO:KEYS discovery/reconnection is checked separately from simulated MIDI note/hold/chord tests.

## Hymn readability and feedback

The hymn view uses up to 1480px of desktop width. Engraving scales notation and lyrics together and wraps measures at smaller widths. Lyric measurement padding keeps words separated without shifting their note alignment. The score has a visible scrollbar and an overflow hint; connected MIDI status sits beside Disconnect (wrapping on phones).

Corrections name both played and expected pitches, with octaves. Expected spelling comes from the actual engraved score, including resolved key/bar accidentals and enharmonic octave boundaries. An unspelled chromatic input shows both common names. Partial chords list the missing fresh/held notes; wrong extras are explicitly distinguished. Wait-for-me matching and triple unexpected C4 restart are unchanged. Feedback uses a reserved, larger bold panel with a border and an atomic live announcement, so corrections do not shift practice controls.

Final validation: 65 unit tests and production build passed; recovery/storage suites passed in Chromium, Firefox, and WebKit; all 40 melody/harmony scores passed desktop/phone layout and matching checks in all three engines. Chromium regression suites passed for base practice, piano, MIDI, key signatures, interval/rhythm practice, and real offline release updates. Interactive Chrome confirmed exact reload recovery, ownership, responsive notation/scrolling, concrete wrong-octave feedback, and real GO:KEYS Bluetooth discovery/reconnection. Physical key/hold behavior was not re-tested by the user; automated MIDI tests cover it. Deployment is verified separately from these local checks.

For unversioned hymn bookmarks, a bounded, selection-specific **Restore older bookmark** action lets the user explicitly recover the retained position when the displayed score is the same; subsequent reloads use the validated new bookmark. This also permits preserving a visually verified installed-app position during migration without manufacturing played notes.
