# Test suite audit — 21–22 November 2026

The suite contract is behavior ownership, rather than preservation of historical
commands or test counts. See [testing.md](testing.md) for the abstraction model.

## Changes and evidence

| Finding | Change | Coverage retained |
| --- | --- | --- |
| Nested aliases repeated DoReGo, NoteWise and SongAlong browser files | Explicit Nightly plans, with expanded execution duplicate checks | Every distinct previously scheduled file and browser configuration |
| Standalone diagnostics SDK ran in two app plans | One owner per engine | Chromium and WebKit SDK contracts, plus app-specific diagnostics UI |
| Soundglow Node/DSP checks ran in both browser jobs, with a further seven-file repeat | One bounded four-process Node pool; real browser reload checks extracted unchanged | State, DSP, native/WASM reference, packaging, server, SDK, reload/worker/cache checks |
| Shared diagnostics/offline units repeated in app aliases | Canonical shared validation owns them | Both complete shared package suites; developer umbrellas remain available |
| Node prerequisite waited behind small leaf tasks | Reserve scheduler capacity and require completion before browser readers | Same assertions, with explicit protection for rebuilt UI output |
| Pure settings layout tests acquired the audio lock | Reviewed UI group with two workers | All Chromium cases; WebKit gains those same settings-layout checks |
| Independent backend stacks stopped serially | Concurrent owned-stack cleanup, with independent failure results | Both stops remain required; failed snapshots retained |
| Concurrent Vite servers invalidated shared optimizer metadata | A private writable cache for every command and partition | Same browser checks remain parallel; actual four-server probe passed |
| Offline fixtures navigated before native cache verification finished | Wait for existing cache.setup.ready lifecycle evidence | All exercise/range, update and repair checks; strict error assertions |
| Incomplete-install fault also broke foreground JS/CSS | Fail a required offline manifest and verify missing/cached states across Retry | Usable foreground app, failed installation, honest readiness and real repair |
| Frozen historical-command fixture prohibited removal of redundant work | Current CI-to-Nightly file ownership and duplicate execution checks | One-time before/after audit verifies retained distinct files; no assertion registry |

The app-plan audit normalizes npm aliases and direct npm-exec commands. It is
not a semantic coverage measure and excludes setup hooks and syntax checks;
those remain reviewed separately in resources.json. Removing literal repeated
executions did not remove assertions. Two different files may still overlap in
behavior and require an assertion-level review before either is retired.

The 34 duplicate browser executions within app/engine plans consumed 550.152
seconds of combined task time in the prior successful Nightly. The additional
cross-app SDK duplicate was removed as well. Combined task time is not elapsed
suite time: many UI tasks overlap. Real audio, backend integration, native
reference comparisons and real loop-boundary playback checks remain required.

The backing-controls browser test also repeated a loop guarantee with an
87-second wait per engine. The retained metronome test seeks near that same real
boundary and checks actual scheduling and PCM continuity. Its boundary assertion
now requires a next-cycle event after the seek: pre-seek beat-zero events cannot
satisfy it. The controls test retains playback and state/navigation contracts and
waits for actual scheduled samples instead of a 700ms startup sleep.

Browser tests now silence only hardware output. Chromium native muting and the
shared context's zero-gain output sink leave upstream PCM, capture, worklets and
offline renders active. A real-browser regression checks both engines in CI.
All 247 Soundglow visual cases remain collected through the silent fixture.
A failed local Nightly exposed an orphan detached server left by cancellation;
its first failure is retained, and a real detached-listener regression now proves
cancellation releases its port even if the child ignores SIGTERM.

## Measurement scope

This is a before/after suite redesign, with fewer duplicate executions and
broader CI coverage. It is not a same-inventory benchmark of worker counts.
The CI 60-second limit is unchanged. Installed browsers and warm npm/OS caches
apply; app outputs are freshly built, and Nightly provisions fresh backend stacks.
CI may reuse its command-specific Vite dependency caches between invocations;
Nightly creates fresh private snapshots and command caches. Record that state
when comparing worker counts. A single Nightly pair and a few CI runs establish
neither p95 nor a flake rate.

The interrupted exploratory runs are retained as cancelled diagnostics, not
successful validation. Their findings informed the ordering and cleanup changes.

## Measured result

| Tier | Before | After | Interpretation |
| --- | --- | --- | --- |
| CI | 46.48s | 46.41s | Still below 60s, with broader Soundglow Node/DSP/server coverage and two-engine silence validation |
| Nightly | 32m31s | 26m12s | 6m19s saved, 19.4% less elapsed time; required tasks went from 143 to 121 by removing repetition |

Both Nightly runs completed all required tasks and backend cleanup. The newer
run used code revision `1fe8e264561f96402a21c10bfd1ee0e70642b1fa`; the older run
used `d041e1c0e9677d5e034d14ff22213c5c692ceb2f`. The 24-logical-CPU, 64 GiB Mac
Studio, worker counts, exact milliseconds, cache conditions and retained evidence
are recorded in [the measurement record](testing-suite-audit.json).

After that measured Mac run, GitHub exposed a race in Soundglow's corruption
fixture: reconnecting could start background staging while the test poisoned a
cached document. The fixture now stays offline until it verifies recovery,
asserts that corrupt bytes were actually injected, and retains the later explicit
online repair. The complete affected local check passed in 51.8s (58.5s including
a fresh build). Whole-suite Mac timing was not repeated for that fixture-only
correction; exact-commit CI and full GitHub Nightly gate publication of the final
revision. A filesystem regression also verifies that evidence retains release manifests,
traces and reports while omitting reproducible update-fixture builds (379 MiB
in the measured run). The complete Mac timing was not repeated for those
fixture/retention follow-ups. A later cleanup correction destroys only each
snapshot's exact registered backend stack: stopping it had preserved disposable
data. Ownership isolation is tested, and the destruction path was exercised
against ten stopped stacks from this investigation, without selecting developer
stacks. This cleanup-only change was not included in the measured Mac run.
The NoteWise release-switch fixture also now waits for both old-release update
checks to finish before replacing its server release; saved-copy readiness
alone precedes network completion. That follow-up was not part of the timed
full Mac run either. A subsequent Chromium worker-termination fixture correction
tracks incremental CDP version events by ID and waits for the active running
worker, with an event-stream regression; it is outside that timing too.
The measurement record keeps validation scopes separate.

The remaining Mac critical path is the real audio timing group, which took
9m28s. Its native microphone/worker/PCM, responsiveness and throttled-rendering
checks retain their assertions and exclusive resource policy. Increasing outer
workers alone cannot shorten that exclusive group. Further retirement needs an
assertion-level review and a convincing cheaper owner.
