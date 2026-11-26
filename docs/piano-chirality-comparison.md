# Published Chirality weight comparison

The subsequent [TypeScript port](../packages/music-practice/research/chirality/README.md)
reproduces all 1,112 native hand/model outputs exactly and adds bounded decoder,
rule-grid, anchored-path and physical-fallback tests. It remains isolated from
application defaults; its full record is `piano-chirality-port-results.json`.

Chirality's published weights are substantially more promising than our locally
trained scalar/structured models. The offline candidate uses their actual twelve
Parncutt weights with their unmodified feature extractor and exact decoder. It
improves both the consumed Czerny collection and old printed annotations, with
important family and sequence regressions still visible. The production planner
is unchanged.

| Printed digit agreement | Current planner | Native uniform Parncutt | Native published weights | Published + our constraints/fallback |
| --- | ---: | ---: | ---: | ---: |
| Czerny, 694 digits | 287 / 41.35% | 339 / 48.85% | 365 / 52.59% | 349 / 50.29% |
| Old printed, 7,947 digits | 5,403 / 67.99% | 4,915 / 61.85% | 5,664 / 71.27% | 5,636 / 70.92% |
| Old completed, 8,757 digits | 3,355 / 38.31% | 5,115 / 58.41% | 6,203 / 70.83% | 6,203 / 70.83% |

Completed annotations remain separate secondary evidence. All corpora are now
consumed comparison data. No fitting, hyperparameter selection or label-guided
candidate selection occurred in this experiment. The published model was trained
on PIG; we cannot certify that its training set contains no overlapping musical
material. These figures are not an independent replication of upstream's PIG
benchmark or a guarantee of human-preferred fingering.

## Actual artifacts and execution

`piano-chirality-artifacts.json` pins source revision
`cd9c54e0dcdfaf0677690f03978cd23ecd90da22` and Hugging Face model revision
`723e5014bcfbe240f22f7767a252c076008c31f5`, with source/weight/model-card SHA-256
hashes and URLs. The two downloaded Python modules match their upstream Git
blobs byte-for-byte. Only those modules run, through a small empty package import
scaffold; the full project, installers, Gym, PPO and training code are not run.

The source is [AGPL-3.0-or-later](https://github.com/vibetuned/chirality/blob/cd9c54e0dcdfaf0677690f03978cd23ecd90da22/LICENSE).
The [model card](https://huggingface.co/vibetuned/chirality-models) says its
PIG-trained rule weights are for research/nonprofit use. Source and weights
remain ignored offline artifacts under `work/chirality`; they are not checked
into product source, bundled or activated. No PIG dataset was downloaded.

The native feature model is different from our classic scalar costs, so the
weights were not pasted into our cost fields. It computes the twelve published
Parncutt pair, triple and per-note features and runs upstream `solve_weighted`.
The uniform control uses exactly the same input, features, solver and finite
native gate, changing only the twelve multipliers to ones. Published weights
gain another 26 Czerny digits and 749 old printed digits over that control;
the result is partly a feature-model improvement and partly learned weighting.

Input is the same full-source physical contact inventory used by our earlier
neural comparison. Ties and same-onset unisons merge while preserving source
occurrence IDs. Each hand's contacts are ordered by onset, then ascending pitch.
Native chord members are consequently flattened into a sequence, consistent
with upstream's statistical annotation approach. All 128 MIDI pitches round-trip
through Chirality's C0=MIDI12 lattice convention; the left hand is mirrored once
by the upstream feature code. Requests contain only contact IDs and pitches:
reference labels, timing, rests and source authorship do not enter the native
model. The current fixtures have no source-authored finger anchors; the adapter
rejects them if added, rather than silently overriding them.

## Safety and comparison semantics

Native Chirality predicts a sequential fingering, with no simultaneous held-key
occupancy constraints. Its finite `1e8` transition gate always permits a path.
Raw prediction coverage is therefore **not** evidence of physical feasibility.
The raw plan's complete status is only an identity/scoring adapter. We separately
run our fixed-input whole-hand planner and independent collision/order checks.

Native published output has 25/32 supported hand paths on the sixteen Czerny
pieces without ornaments. It double-books one finger in each of exercises 2,
11 and 12. The old printed corpus also retains the already-known cross-hand
source collision in `hanon-40-40`. These raw outputs are never treated as safe
product suggestions.

The constraint-checked candidate offers the single published native path for
each entire hand to our existing planner. If it is supported, it is accepted;
otherwise the classic hand plan remains. There is no reference-label comparison
in this selection and no per-note patchwork. It accepts 25 Czerny hands,
264 old printed hands and 220 old completed hands. The resulting plan has the
same support coverage as classic and zero independently detected conflicts.
Model-relative feasibility is not an anatomical proof.

As before, Czerny exercises 4, 5 and 13 remain explicitly unsupported for all
methods because their grace-note notation has no physical timing realization
in this import. Their 113 eligible digits stay in the denominator. All methods
cover 581/694 Czerny digits; the checked candidate and classic cover 7,898/7,947
old printed digits and all 8,757 completed-reference digits. Raw native output
also labels unsupported old source material, so it covers all 7,947 digits;
the agreement denominator remains the full 7,947 for every method.

The report's `nativeGateViolations` counts upstream's finite practical-span
penalties, not our physical conflicts. Some large released jumps that receive
that native penalty are supported by our time-aware planner, explaining the
118 such transitions in both raw and checked completed-reference output.
Classic has no applicable native gate count.

## Gains and limitations

The checked candidate gains 62 Czerny digits (+8.93 percentage points) and
233 old printed digits (+2.93 points). It improves eight Czerny pieces, regresses
six and ties five. Native unfiltered output improves twelve, regresses four and
ties three, with its safety failures reported above. Adjacent printed Czerny
transitions rise from 57/251 to 106/251 for the checked candidate. Completely
matched annotated Czerny hands remain one, with no completely matched pieces.

| Old printed family | Current | Checked Chirality | Change |
| --- | ---: | ---: | ---: |
| Scales | 1,075 | 1,202 | +127 |
| Chromatic | 736 | 624 | **-112** |
| Arpeggios | 164 | 311 | +147 |
| Five-finger | 2,932 | 2,901 | **-31** |
| Technical | 344 | 448 | +104 |
| Repertoire | 152 | 150 | **-2** |

Whole old printed cases with all supplied labels matched fall from 13 to 9,
while fully matched annotated hands increase from 36 to 70. This is a useful
candidate, not an across-the-board replacement. A next experiment could preserve
the current planner's chromatic/five-finger strengths and test selection based
on score structure, using a newly reserved collection before tuning. None of
those selection policies was tuned or enabled here.

## Validation and reproduction

Before corpus inference, the runner checks all 128 MIDI/lattice conversions and
exhaustively enumerates 625 digit paths for each hand, under both uniform and
actual published weights. It checks feature totals against upstream's aggregate
rule evaluator and exact minimum cost against native Viterbi, including its
finite gate. All four exhaustive validations pass. All 281 cases retain IDs,
input hashes, family/evidence groups, full prediction strings, feasibility
diagnostics and conflict counts in `piano-chirality-results.json`.

The modules ran under Python 3.11.14 and NumPy 2.4.6, without installing the
full project's Python>=3.14/Gym/Torch dependency stack. Native extraction and
both decodes for all cases took about 7 seconds. Per-method native timings include
feature extraction plus decoding; checked timings additionally include our
constraint/fallback wrapper. They are offline measurements, not browser latency
guarantees. The first preparation added a trailing newline through file creation;
it was removed and the run repeated with byte-identical pinned modules. All
retained predictions use those verified bytes.

```sh
python3 packages/music-practice/scripts/piano-neural/chirality-fetch.py docs/piano-chirality-artifacts.json work/chirality-replay
npx tsx packages/music-practice/scripts/piano-neural/chirality-prepare.ts work/chirality-replay/requests.json
# Use a research Python environment with NumPy; no project installation needed.
python3 packages/music-practice/scripts/piano-neural/chirality-infer.py work/chirality-replay/upstream work/chirality-replay/parncutt.json work/chirality-replay/requests.json work/chirality-replay/predictions.json
npx tsx packages/music-practice/scripts/piano-neural/chirality-evaluate.ts work/chirality-replay/requests.json work/chirality-replay/predictions.json docs/piano-chirality-artifacts.json work/chirality-replay/comparison.json
node --import tsx --test packages/music-practice/tests/piano-chirality-comparison.test.ts packages/music-practice/tests/piano-neural-comparison.test.ts
```

The existing shared/music CI unit glob owns bounded artifact identity, mode
selection, malformed digit/diagnostic, source-anchor rejection and held-key
fallback regressions. Existing neural-comparison tests retain tie/unison identity,
raw safety auditing, label-independent constrained selection and cross-hand
conflict coverage. External source, weights and corpus inference add no runtime
dependency or required network command to CI.
