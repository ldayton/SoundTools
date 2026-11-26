# Latent structured piano ranking experiment

The later [Chirality comparison](piano-chirality-comparison.md) tests published
external weights; this report concerns our two locally trained models only.

Neither learned model earns promotion over the current planner. On the fresh
Czerny test collection, scalar reweighting gains three printed digits and the
structured ranker gains one. Both lose the baseline's one completely matched
annotated hand. The structured ranker improves agreement on the training corpus
but regresses on five-finger exercises. Production keeps the classic planner.

| Printed digit agreement | Current classic | Learned scalar costs | Latent structured ranker |
| --- | ---: | ---: | ---: |
| Fresh Czerny, 694 digits | 287 / 41.35% | 290 / 41.79% | 288 / 41.50% |
| Old printed training data, 7,947 digits | 5,403 / 67.99% | 5,345 / 67.26% | 5,536 / 69.66% |
| Old completed annotations, 8,757 digits | 3,355 / 38.31% | 3,771 / 43.06% | 4,753 / 54.28% |

The old printed figures measure fitting, not generalization. Completed labels
remain secondary, previously consumed evidence and were not training targets.
Editorial agreement is not a uniquely correct or anatomically certified fingering.

## Reservation and leakage boundary

Commit `b786e018` reserved all 19 available Czerny Op. 821 sources from the
pinned Mutopia revision `5843d1b1868906b4e20c77ba0bc9f442c6d92a83`, before any
training. The exact source files, individual SHA-256 hashes, public-domain
declarations and URLs are in
`packages/music-practice/test-fixtures/external/mutopia-czerny/reservation.json`.
Selection used the complete directory listing, never planner performance. No. 17
had been inspected during earlier research but had never been scored or trained.
The whole book is excluded from fitting and model selection; there is no
fragment/transposition split across train and test.

The same commit froze `structured-protocol.json`: eight deterministic epochs,
learning rate 0.02, regularization 0.001, final parameter averaging, no
hyperparameter search and no tuning after seeing the fresh scores. Training uses
all 152 previously consumed printed-evidence cases, with 252 annotated hands
and 7,947 eligible digits. Unlabelled cases remain in the inventory. Each learner
averages 2,016 annotated-hand steps, including steps without an update.

The valid frozen weights were produced at `ea22a22f`, before fresh scoring,
and are retained in `piano-structured-weights.json`. They include protocol,
training-source and implementation hashes, the complete training ID list,
epoch diagnostics and elapsed time. The evaluator verifies these hashes and
the reserved source hashes before making predictions. Prediction receives only
score notes and frozen weights; test labels enter the scorer. No weights are
imported by the product.

## Models and inference

Both learners use the existing exact classic dynamic program, pose generator,
hard transitions, search limits, source anchors, ties and hand ownership.
`planPianoPhraseRanked` adds an offline scoring hook; production calls are
unchanged. Reference-compatible inference filters the **same unconstrained
candidate graph**, rather than generating different geometry from reference
digits. Unknown fingers and wrist anchors stay latent and are recomputed under
the current weights at each update. No pseudo-label is made permanent.

The scalar baseline learns the four active classic cost multipliers: posture,
movement, repeated-note finger changes and crossings. Their weights remain
nonnegative. Inactive components and hard constraints stay fixed.

The structured model learns those costs plus score-conditioned attack/pair
features: key color and digit, phrase boundaries, turns and runs, interval/digit
transitions, pair comfort and key depth. It has 128 observed coefficients,
including the four scalar costs. Contextual coefficients may be signed within
[-4, 4]; scalar costs remain in [0, 8]. Context derives only from score input.
Rests, changing voices and ambiguous moving attacks prevent pair interpretation.
This first-order contextual ranker does not yet learn a latent three-attack
thumb-pivot model or a neural representation.

Training uses a loss-augmented latent structured perceptron: minimize the current
cost over compatible completions, find the cost-minus-Hamming-loss competitor
over all legal completions, and update toward the compatible path. Hamming loss
and normalization use supplied printed digits only. Held or unannotated notes
are not discarded. The two models retain the same three incompatible annotated
hands as the previous audit, with reasons recorded at every epoch. No physical
constraint is relaxed to make a reference fit.

An initial implementation run at `bdd7d893` exposed a same-finger comfort
infinity sentinel entering the soft feature vector. It was invalid, never
evaluated on fresh data, and retained in `piano-structured-training-failure.json`.
The corrected code keeps released repositioning legal and rejects nonfinite
features; the fixed protocol and training schedule were unchanged.

## Fresh import and checks

The retained `piano-czerny.json` contains 3,101 notes and 694 unambiguously
pitch-attached printed digits. The importer passes sanitized music assignments
to the installed LilyPond 2.26 parser and our own AST dumper. It preserves exact
rational onsets/tuplet durations before numeric conversion, absolute pitches,
source voices, hand ownership and ties. Headers, layout and executable upstream
Scheme are not executed. Chord-level or compound digits without an unambiguous
pitch attachment are flagged, not guessed. Each raw event remains in the import
inventory.

Exercises 4, 5 and 13 contain grace notes. Their zero-time notation is retained;
we do not invent physical performance durations. All three models receive
`unsupported_notation` for these entire pieces, including both hands, and their
113 eligible labels remain in the denominator. This is an explicit conservative
import/planner limitation, not a model-specific failure or a post-score omission.
The remaining 16 pieces have 32/32 complete hand plans for every model.

An independent check against LilyPond's actual MIDI interpreter matches all
2,572 unique attack pitches and quantized onsets across those 16 pieces.
Repeated source unisons can share a MIDI attack. The record is
`piano-czerny-midi-verification.json`. MIDI ticks truncate fractional tuplet
positions; the first verification attempt incorrectly rounded them and failed
on No. 14. The corrected comparison uses the actual tick conversion. This
check does not independently certify editorial digits or articulation-dependent
hold durations.

Every evaluation case also verifies zero-coefficient output against the entire
classic plan, including paths, costs and diagnostics. The independent physical
conflict checks find zero cross-hand key collisions, finger double bookings or
non-thumb ordering violations. Coverage is identical for all three models:
581/694 fresh digits and 16,655/16,704 old eligible digits. Source identity,
constraints and exact search bounds remain in force.

## Generalization and regressions

On the fresh pieces, scalar improves six, regresses five and ties eight.
Structured improves six, regresses eight and ties five. Whole-piece bootstrap
95% intervals for agreement change versus classic span zero: scalar
[-2.02, +2.73] percentage points; structured [-4.24, +4.50]. These are descriptive
intervals for one small book, not evidence of broad stylistic generalization.

Fresh completely matched annotated hands are 1 / 0 / 0 for classic / scalar /
structured. No model completely matches an entire annotated fresh piece.
Adjacent printed transitions improve from 57/251 to 63/251 and 59/251,
respectively, without a meaningful overall accuracy gain.

The structured model's old printed-family changes are +84 scale digits,
+2 chromatic, +97 arpeggio, **-103 five-finger**, +53 technical and no change
in repertoire. Fully matched old printed cases fall from 13 to 11 despite
matched hands increasing from 36 to 42. Scalar loses 58 printed digits overall.
The large completed-label gains cannot outweigh these failures of transfer and
sequence fidelity. The full per-piece/family results and prediction strings
(source note order, zero for unsupported) are in `piano-structured-results.json`.

Training both models took 61.4 seconds outside CI. In the retained comparison,
fresh inference is tens of milliseconds per piece, and structured inference is
slower than classic. Exact timing distributions are in the report; they include
no model loading, network, hardware audio or training. No browser runtime or
model dependency was added.

## Reproduction and regression ownership

```sh
# Optional research tools require LilyPond 2.26; MIDI cross-check also needs mido.
python3 packages/music-practice/scripts/piano-neural/import-czerny.py work/structured-replay
python3 packages/music-practice/scripts/piano-neural/verify-czerny-midi.py work/structured-replay

# No fresh corpus is read by this fitting command. Use a new output filename.
npx tsx packages/music-practice/scripts/piano-neural/structured-train.ts work/new-weights.json
npx tsx packages/music-practice/scripts/piano-neural/structured-evaluate.ts docs/piano-structured-weights.json packages/music-practice/test-fixtures/piano-czerny.json work/new-comparison.json

node --import tsx --test packages/music-practice/tests/piano-structured-ranking.test.ts packages/music-practice/tests/piano-czerny-import.test.ts
npm run ci -- --base origin/main
```

The existing shared/music CI unit glob owns the new bounded tests: classic
compatibility, raw feature additivity, exhaustive digit-path constrained/loss
oracles, finite pair features, source anchors, tie aliases, hard constraints,
search limits, gradient direction/projection, input context resets, importer
safety, rational timing and annotation uncertainty. Existing independent
geometry/path and whole-hand assurance tests remain required. The synthetic
import test needs only Python's standard library; corpus conversion and MIDI
reference generation are optional research commands, not extra CI tiers.

No human review gate, product activation, push or deployment is part of this
experiment. A future attempt should reserve another genuinely fresh collection
before tuning and address the five-finger/phrase consistency regressions. This
fresh book is now consumed evaluation data.
