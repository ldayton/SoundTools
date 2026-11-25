# Piano fingering audit and regression baseline

## Current production ownership

- `piano-fingering.ts`: original TypeScript DP for one voice of single MIDI notes.
  States contain finger and nominal white-key anchor. It considers ordinary
  thumb crossings, relocation, repeated notes, rests, black-key penalties and
  ties. Durations are whole-note fractions; it has no BPM or hand-size profile.
- `hymn-fingering.ts`: generated annotations for non-edition scores. It groups by
  staff/voice and historically inferred hand from bass vs other clefs. A chord
  invalidated one voice; other voices for the same hand were still independently
  numbered, without reserving their fingers for held notes.
- `beginner-score.ts` and the `instrument-editions.ts` registry: edition finger
  providers, including reviewed editorial piano tables. These remain authoritative.
- `standard-hymn-editions.ts::standardFingers`: uses the monophonic planner for
  some melody tables, then stores numbers by bar/pitch; its accompaniment uses
  fixed chord patterns. That lookup can lose occurrence-specific context. It is
  not a complete hand-state plan and must not be mistaken for one.

The current model is a prototype, not an anatomical guarantee. A piano chord
cannot be implemented by applying the melody planner to each note or voice.
A generated voice must not ignore another voice played by the same hand.

## Changes in this baseline

The monophonic API now validates hand, integer MIDI 0..127, positive finite
notated durations, optional boolean flags, and fixed fingers 1..5. A tie must
continue the preceding pitch without a rest. The previous implementation could
accept C tied to C-sharp. Conflicting fixed fingers on a tied contact have no
valid plan and raise the existing unsupported-plan error.

An optional `finger` is a hard search constraint. Existing unconstrained costs
and editorial tables are unchanged. The generated-score adapter permits a
passage's first visible tied continuation to establish a new initial contact;
subsequent continuations remain constrained. It now withholds generated marks
for a whole unsupported hand (chords or multiple pitched voices), while retaining
supported suggestions for the other hand. This is a conservative boundary until
whole-hand planning is implemented, not new chord support.

## External data and execution boundary

Only original source text and literal fixtures were inspected. No downloaded
FOSS implementation, test runner, package installer or setup script was executed.
The committed `.py.txt` files are provenance data, not executable test inputs.
Only our own TypeScript planner, adapters and tests execute.

- Kanma/piano_fingering, MIT: eight input/reference fixtures, retaining original
  test text, revision, license and attribution. Six monophonic RH/LH scale,
  rest and fixed-finger cases assert the actual selected fingers. Two chord
  examples are saved as reference data and explicitly treated as unsupported by
  the current API; they are not reported as passing chord-generation tests.
- marcomusy/pianoplayer, MIT: synthetic existing-anchor regression, tested against
  our real search rather than its source test's stubbed optimizer.
- PIG and PianoVAM were not imported: the data carry academic/noncommercial
  restrictions independently of licenses on related software. No score files
  were assumed redistributable just because a repository's code is MIT.

## Verification owners

- `piano-fingering.test.ts`: existing movement/scale/tie contracts, retained.
- `piano-fingering-safety.test.ts`: invalid input, false ties and hard anchors.
- `piano-external-fingering.test.ts`: the licensed external reference cases.
- `piano-planner-assurance.test.ts` and test-only `piano-fingering-oracle.ts`:
  independent keyboard geometry/scoring and exhaustive full-path enumeration for
  64 short RH/LH phrases, with black keys, ties, rests and fixed fingers. The
  oracle does not call production geometry, scoring or candidate functions.
- `piano-planner-mutations.test.ts`: six compiling mutations of our own code must
  fail observable assertions (ignored anchors, broken ties, wrong hand direction,
  wrong predecessor, lost note and changed-pitch ties). Syntax/import errors do
  not count as kills. No external source is compiled or executed.
- `piano-fingering-voices.test.ts`: whole-hand eligibility and passage-start ties.
- SongAlong `piano-fingering-catalog.test.ts`: all source melodies/transpositions.
- SongAlong `piano-fingering.browser.ts`: actual SVG annotations for supported
  hands, suppression of unsupported hands, and unchanged musical data. This is
  an independent, port-free CI/Nightly command in the executable policy/resource
  inventory. Existing edition/control browser contracts remain required.

Shared unit coverage uses the existing music test glob, not a new tier. The
browser witness uses synthetic music to exercise the renderer directly; it
makes no assumption about a named product song.

## Next architectural contract

A whole-hand planner should consume identified, timed notes with explicit hand,
MIDI pitch, key-held duration, optional tie predecessor and fixed/editorial digit.
Time must be normalized to quarter-note beats. Combine every voice for a hand,
including hidden notation, into one attack/release timeline. Staff/clef changes
must not silently change hand ownership. Pedal-sustained sound and sample release
tails must not be confused with fingers physically holding keys.

The result should retain every occurrence, complete simultaneous hand contacts,
explicit substitutions/crossings, movement annotations, and a cost breakdown.
Keep hard physical/tie/anchor constraints separate from ergonomic preferences;
thumb passage during overlapping notes needs explicit piano-specific treatment.
Do not transplant guitar finger ordering, barre rules or hand geometry.

Start with reviewed chord, held-note and substitution cases before choosing reach
limits or replacing the existing renderer. Preserve editorial digits as hard
constraints or an explicit editorial mode. Reference agreement should accept
multiple musically appropriate answers; exhaustive/property/mutation checks prove
correctness within a model, not that its weights are pedagogically optimal.
