# Shared piano fingering planning

## Production ownership and behavior

Generated piano annotations use `piano-phrase-fingering.ts`: a timed whole-hand
planner for explicitly identified RH/LH notes. Starts and physical key-held
 durations use quarter-note beats. Every voice for a hand shares an attack/release
timeline. Ties and same-onset unisons preserve all occurrence IDs while sharing
one physical contact; a later restrike of an already-held key is diagnosed.

`piano-score-fingering.ts` converts abcjs notation and MIDI attacks, including
mixed tied/fresh chords. It establishes hand ownership once from source staves,
normalizes score tempo, and maps visible notation to full-source note IDs.
`practice-score.ts` retains a complete planning tune when staves are hidden.
`hymn-fingering.ts` engraves the resulting single/chord digits and movement marks;
tied continuations do not acquire duplicate attack digits. Hiding notation never
removes its physical constraints. A cropped source starts a new planning context;
an orphan continuation needs actual MIDI evidence, not an invented prior finger.

`piano-hand-model.ts` centralizes keyboard geometry, single-note motion and exact
path search. `piano-fingering.ts` remains the compatibility adapter with whole-note
fraction durations; existing mono scale, tie and licensed reference contracts
remain unchanged. Generated timed planning can select different digits because
it considers duration, tempo and concurrent contacts.

`beginner-score.ts`, `instrument-editions.ts` and reviewed editorial tables remain
an explicit separate mode. `standard-hymn-editions.ts::standardFingers` still
constructs some melody tables through the legacy API; those tables are not being
replaced by generated whole-hand plans. No song-specific exceptions were added.

## Hard constraints and preferences

The exact dynamic program keeps every declared candidate, with no beam pruning.
Its state includes wrist anchor, active key identities and occupied fingers.
Held fingers remain reserved. Optional substitutions incur a separate cost and
return timed events; they are off by default. An overlapping thumb passage needs
an already-held contact and explicit crossing metadata. Non-thumb digits keep
mirrored order within simultaneous grips. Reach limits are conservative,
configurable piano-specific model parameters, not anatomical guarantees.

Costs report posture/black-key preference, movement, repeated-note finger changes,
crossings and substitutions. Movement considers tempo and actual opportunities.
Unsupported hands receive a structured diagnostic and no partial suggestions;
the other hand can still receive a complete plan. Key-hold durations do not mean
pedal sustain or sample release tails. Cross-hand ownership conflicts, unsupported
notation, contradictory anchors and insufficient reach are reported explicitly.

Search defaults cap input at 8,000 total / 4,000 notes per hand, 8,000 frames,
100,000 candidates and 2,000,000 attempted transitions per hand. Callers can lower
these budgets. Exceeding one returns `search_limit`, never a truncated optimum.
Statistics retain frame/candidate/transition counts and maximum layer size.
This deliberately supports a bounded conservative technique set; it does not
claim human-approved optimum ergonomics, all hand sizes, pedal-aware release,
arbitrary hand redistribution or every advanced piano technique.

## External data and execution boundary

Only source text and literal fixtures were inspected. No downloaded FOSS
implementation, installer or test runner was executed. `.py.txt` files remain
provenance data. Only our TypeScript implementations and test tools execute.

- Kanma/piano_fingering, MIT: eight fixtures retain original test text, revision,
  license and attribution. Six legacy mono examples assert selected digits. Both
  chord references now execute against our whole-hand planner as feasible fixed
  alternatives; unconstrained planning must also succeed, without requiring a
  unique reference optimum.
- marcomusy/pianoplayer, MIT: the existing-anchor data regression exercises our
  real planner. Original source remains data only.
- PIG and PianoVAM were not imported because their data have academic or
  noncommercial restrictions independently of associated software licenses.

## Acceptance and regression owners

[Acceptance criteria](piano-whole-hand-acceptance.md) define this phase's contract.

- `piano-fingering.test.ts`, `piano-fingering-safety.test.ts`, and
  `piano-external-fingering.test.ts`: existing single-voice/reference contracts.
- `piano-phrase-fingering.test.ts`: chords, mirrored/compressed/octave grips,
  overlaps, mixed ties, unisons, fixed fingers, explicit thumb passage and
  substitutions, invalid input, impossible hands, clock precision, representation
  invariance, dense 240-note passages and explicit resource diagnostics.
- `piano-fingering-voices.test.ts`: actual abcjs conversion, mixed tie attacks,
  rests, source anchors, ambiguous chord annotations, changing clefs, cropped
  continuations and quarter-beat tempo normalization.
- `piano-planner-assurance.test.ts` / `piano-fingering-oracle.ts`: independent
  geometry/scoring and exhaustive mono paths for 64 short phrases.
- `piano-whole-hand-assurance.test.ts` / `piano-whole-hand-oracle.ts`: independently
  enumerate complete short chord/held-key paths and recompute their costs. The
  oracle intentionally covers ordinary non-crossed polyphonic frames, not rests
  or substitutions; those have explicitly specified behavioral witnesses.
  Forty-eight seeded two-hand phrases preserve known playable fixed witnesses,
  also run unconstrained, and check held fingers, identity and order invariance.
  Failures include a replayable seed and deletion-minimized note data.
- `piano-planner-mutations.test.ts` and `piano-whole-hand-mutations.test.ts`: thirteen
  compiling mutations must fail observable assertions, including ignored anchors,
  lost ties/unisons, invalid crossings, held-key substitutions, wrong predecessor,
  dropped notes, wrong hand and ignored resource budget. Compile/import errors
  are never counted as mutation kills; only our own source is compiled.
- SongAlong `piano-fingering-catalog.test.ts`: source melody/transposition coverage.
- SongAlong `piano-fingering.browser.ts`: registered silent, port-free Chromium /
  WebKit witness for real SVG chords, overlapping voices, tied attacks, hidden
  full-source planning, pitch/head order, explicit substitution timing, authored
  edition routing, unsupported-hand isolation and unchanged notation/audio data.
  It exercises shared rendering components; existing app/edition contracts own
  the complete application flows.

The shared unit glob and existing independently required CI/Nightly browser
command own the new coverage; no new tier, runner bypass or additional duplicated
browser command was introduced. Full local CI validates the clean committed HEAD.

The first browser witness exposed absent-viewBox SVG bounds clamping every chord
label to the top edge. The renderer now falls back to actual SVG dimensions;
the pitch/head-order assertion owns the regression. Initial evidence is retained
under `work/ci-results/1795647353659-43304209`. A later expanded fixture initially
imported Vite-only audio modules through the complete app renderer; the fixture
now exercises the actual shared annotation, hiding and editorial components
without importing the unrelated audio runtime. No product/browser errors were
ignored to pass these checks.

## Editorial benchmark and contextual thumb passage

The [permissive piano benchmark](piano-benchmark.md) adds pinned, licensed
historical editorial evidence and an independently reserved validation experiment.
Timed planning now recognizes long stepwise runs and charges ordinary thumb
passage as rolling motion within that context. Geometry/search and compatibility
ownership remain centralized; legacy/editorial tables keep their previous costs.
The benchmark documents exact-match gains, remaining disagreements, corpus
coverage, source exclusions, reproduction and CI/Nightly regression owners.
