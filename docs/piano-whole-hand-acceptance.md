# Whole-hand piano planning acceptance criteria

This phase is complete only when the shared planner is used by generated score
annotations, the following contracts have regression owners, and local CI passes.
Authored edition fingerings remain authoritative. No downloaded FOSS code runs.

## Input and physical contracts

1. Input notes have stable IDs, explicit right/left hand, MIDI pitch, start and
   key-held duration in quarter-note beats, optional fixed finger and tieFrom.
   Reject invalid/duplicate IDs, nonfinite/unrepresentable times, invalid pitches,
   hand/finger values, changed-pitch/changed-hand ties and branching/disjoint ties.
2. Merge all voices for each hand into attack/release frames. Preserve every
   note occurrence, including tied segments and simultaneous notated unisons.
   A simultaneous same-hand unison uses one physical key/finger; conflicting
   anchors or a fresh attack while that key is still held are unsupported.
3. At most five different keys/fingers per hand. Held keys retain their fingers
   unless substitutions are explicitly enabled. A finger cannot hold two keys.
   Fixed/editorial digits are hard constraints throughout the tied contact.
4. Piano-specific, configurable reach limits and mirrored hand direction govern
   complete grips. Permit ordinary chords, compressed grips and octave spans.
   Support thumb passage through a briefly overlapping held note with an explicit
   crossing event; do not accept arbitrary non-thumb finger crossing in a chord.
   Unsupported geometry returns a structured diagnostic, never fabricated digits.
5. Duration means physical key hold, not pedal sustain or sample-release tails.
   Do not infer hand from every changing clef or silently reassign hands. A
   physical key claimed by both hands simultaneously is diagnosed, not guessed.

## Planning and integration

6. Find the exact minimum over the declared candidate/transition model, with no
   beam pruning or greedy per-voice choices. Costs cover posture, black-key
   preference, movement, repeat changes, crossings and explicit substitutions.
   Tempo and actual transition opportunities affect movement costs. Return the
   complete state path, note identities, movement events and cost breakdown.
7. An unsupported hand has no partial suggested digits; the independent other
   hand can still be planned. Validate before engraving; do not change pitches,
   durations, rests, audio, tablature, layout geometry or persistence contracts.
8. Generated notation uses the full score, including hidden voices, with stable
   hand ownership and occurrence IDs across systems and barlines. A cropped
   passage establishes a contact only from actual pitch evidence; it never invents
   an unseen preceding finger.
   Chord numbers align with the correct noteheads. Tied continuations do not
   duplicate attacks. Default annotations never silently substitute held fingers.
9. Share keyboard geometry, monophonic motion costs and path optimization with
   the legacy single-voice API. Preserve its existing scale/reference contracts
   and reviewed edition rendering. No song/exercise-specific fixes or runtime
   mutation hooks. Keep notated/editorial and generated modes explicit.

## Verification and resource contracts

10. The previously retained MIT chord examples become actual planner cases:
    their digits are valid alternatives/anchors, not the only acceptable optimum.
    Add independently specified tests for held bass, mixed ties/fresh chord
    attacks, hand mirroring, thumb crossings, rests, fixed fingers, unisons,
    substitutions, impossible hands, representation invariance and timing bounds.
11. A test-only exhaustive oracle independently enumerates small complete paths
    and recomputes feasibility/cost. Seeded known-playable polyphonic phrases
    preserve witnesses and yield replayable minimized failures if a check fails.
    Compiling mutations of our own code must be killed by observable assertions.
    Syntax/import failures are not kills; external programs remain unexecuted.
12. Chromium and WebKit exercise real chord/overlapping-voice SVG annotations,
    hidden-voice invariance, correct pitch/head association, unsupported-hand
    isolation, unchanged music and preserved editorial behavior. Use the existing
    registered silent browser witness and generic/synthetic fixtures.
13. The search has deterministic resource bounds and operation statistics.
    Dense representative phrases complete within those bounds; exhausting a
    bound produces an explicit unsupported diagnostic, not a hang or truncation.
    Register coverage in the existing CI/Nightly policy; preserve the 60-second
    full local CI budget and exact committed-HEAD validation before any push.

These criteria prove implementation correctness within a conservative model.
They do not claim that a heuristic ergonomic score is a human-approved fingering
or that every advanced piano technique is supported.
