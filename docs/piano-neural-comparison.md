# Pretrained piano fingering comparison

## Decision

Keep the released classic planner as the production default. Retain the neural
comparison as an isolated research tool; no app dependency, model download,
UI setting, score, audio, authored fingering or stored preference changes.

Lumikey is a useful candidate for a future learned preference model. Its constrained
six-candidate shortlist raises overall reference agreement, but slightly lowers
agreement with the stronger printed evidence, regresses three families, and reduces
complete-case agreement. Fresh independent teacher-reviewed passages are required
before promotion. No family-based routing or reference-derived choice was added.

## Protocol and data

Baseline: `d84a6f59b8028f95ff5a36ea9d8ac9c27cfd495a`. All 262 existing cases,
39,264 note occurrences and 16,704 eligible reference digits are retained. This
includes the 32 polyphonic cases excluded by the earlier released-mono comparison,
so its 51.95% figure has a different denominator from this experiment's 52.43%.

All inputs come from the existing pinned permissive Hanon/dacapo and Beringer
references. Printed and completed transcription evidence remain separate. This
is consumed benchmark data, not a fresh holdout or a PIG benchmark. Training-set
overlap, particularly familiar scales, cannot be ruled out. No model was retrained
or tuned on these labels. The beam width of six, metrics, fallback and full corpus
were recorded before evaluation in the retained protocol.

Inference receives pitches, hand ownership, timing, genuine source anchors and
physical contacts only. Reference digits and alternatives never enter inference.
Ties and same-onset unisons share a contact; its result expands back to every
original note ID. Models see milliseconds at each case's standardized tempo.
Reference scoring uses the existing identity/whole-alternative/sequence scorer.

Three pretrained architectures were evaluated: Lumikey's small Transformer and
Ramoneda's ArGNN and ArLSTM. Greedy and six-path beam decoding are both reported.
The research repository's PIG loader maps written C4 to 48, whereas standard MIDI
C4 is 60. Both standard-MIDI and minus-12 input conventions are retained for the
two Ramoneda models; neither convention changes the conclusion or was selected by
reference agreement. These are our isolated inference adapters, not a reproduction
of the papers' original dataset splits, evaluation or claimed accuracy.

## Results

| Method | Reference matches / 16,704 | Agreement | Hands feasible in current model / 524 |
| --- | ---: | ---: | ---: |
| Current classic | 8,758 | 52.43% | 522 |
| Lumikey, greedy | 10,242 | 61.31% | 496 |
| Lumikey, beam six | 10,728 | 64.22% | 497 |
| Lumikey, constrained shortlist | 10,684 | 63.96% | 522 |
| ArGNN, beam six, standard MIDI | 7,671 | 45.92% | 486 |
| ArGNN, constrained, standard MIDI | 7,814 | 46.78% | 522 |
| ArGNN, beam six, PIG loader convention | 7,599 | 45.49% | 484 |
| ArLSTM, beam six, standard MIDI | 6,006 | 35.96% | 490 |

The detailed report retains both conventions, both decoders and constrained results
for every case. Agreement is reference matching, not a probability of musical
correctness; feasibility is relative to our conservative model, not human anatomy.
The same two conflicting hands remain explicitly withheld under the current and
constrained models, leaving 16,655 / 16,704 labels covered. They remain in the
agreement denominator. Raw predictions cover them but independently fail safety.

| Evidence | Classic | Lumikey constrained |
| --- | ---: | ---: |
| Printed, 7,947 digits | 67.99% | 67.08% |
| Completed transcriptions, 8,757 digits | 38.31% | 61.13% |
| Completely matched annotated cases / 211 | 13 | 5 |
| Completely matched annotated hands / 420 | 36 | 42 |
| Adjacent labelled pairs / 12,531 | 4,717 | 6,911 |

Lumikey constrained improves 144 cases, leaves 60 unchanged and worsens 58. Its
Hanon arpeggio agreement rises 28.92% to 66.84%, and completed Beringer arpeggios
rise 22.18% to 51.62%. Five-finger, chromatic and teaching-repertoire agreement
decline. An aggregate gain therefore fails our existing promotion expectations.

## Constraint experiment

For each hand, the hybrid tries the neural model's six complete sequences in
likelihood order as fixed digits in the current whole-hand planner. The first
feasible sequence is retained; otherwise the original classic hand plan is used.
Source anchors and ties remain hard constraints. There is no partial-hand output,
reference-based candidate selection, relaxed reach or silent substitution.

Lumikey supplies a feasible shortlist choice for 498 / 524 hands. The other 26
fall back, including the two unsupported conflicting hands. An independent audit
detects one held-finger double booking in the raw beam result and the source's
cross-hand key conflict. Neither remains in constrained output.

This is a bounded shortlist filter, not an exact joint neural/physical optimum.
It cannot recover a good neural alternative outside the shortlist. A future
learned cost integrated with exact planning is a separate experiment; it needs
explicit state semantics for the neural history and independent validation.

## Runtime and adapter verification

Only our adapters and installed PyTorch operators execute. No upstream installer,
training script, dataset loader or inference module executes. Checkpoints load
with `weights_only=True`; the old research files additionally require an explicit
allowlist of PyTorch's built-in `NLLLoss`. Unexpected globals are rejected.
All eight downloaded model artifacts are pinned and byte/hash verified. No PIG,
ThumbSet or other restricted dataset was downloaded.

Independent adapter checks cover token values, key color, timing units, onset/next
graph directions, exact two-attack decoder enumeration and source anchors. Real
ONNX browser inference matches PyTorch on all 30 probes in both Chromium and
WebKit, with maximum logit error below 0.00000334 and identical predicted digits.

On this Mac, with ONNX Runtime Web 1.23.2 and one WASM thread, observed warm
per-probe median/p95 were 0.4/0.6 ms in Chromium and 1/1 ms in WebKit. Both model
sessions loaded locally in about 190/309 ms respectively. These are short local
desktop observations, not phone timings, network loads, production latency SLOs
or whole-score beam measurements. The two ONNX weights total 1,002,260 bytes;
the WASM runtime adds roughly 11 MB plus JavaScript.

The CPU corpus runs include greedy and beam-six inference: approximately 56 seconds
for Lumikey, 10 for ArGNN and 12 for ArLSTM. Runs overlapped and are descriptive,
not a controlled speed ranking. The constrained Lumikey filter added about three
seconds over all cases. Model/adapter/runtime provenance, timing observations,
per-family results and per-case diagnostics are in `piano-neural-results.json`.

## Licensing and deployment

- Lumikey revision `e03c0da6bfe6b4299dbdacb421bd5792f1721631`: the JS package
  declares MIT, but the repository has no root license file or separate weight
  grant. Its README says all supplied data, including PIG, are used in training.
  A product deployment needs clarification of the model-use terms and provenance.
- Ramoneda revision `d0d2f433c926be5e89540cbafe38bf43820ad2d2`: repository MIT
  notice retained below; the release includes pretrained tensors. Dataset access
  and model deployment rights must be considered separately.
- PIG's public terms allow nonprofit academic use only. ThumbSet is access-controlled.
  Neither was imported. This experiment's input corpus retains its existing
  permissive source notices. No third-party weights or implementation are vendored
  into the application or committed here.

Sources: [Lumikey](https://github.com/lumikey/piano-fingering-model),
[Ramoneda implementation](https://github.com/PRamoneda/Automatic-Piano-Fingering),
[2022 paper](https://doi.org/10.1145/3503161.3548372),
[PIG terms](https://beam.kisarazu.ac.jp/saito/research/PianoFingeringDataset/),
[ThumbSet](https://zenodo.org/records/6433702).

## Coverage and reproduction

The follow-up [blind teacher review PFR1](piano-teacher-review.md) now has
independent and anonymous comparison packets. Teacher responses are pending;
packet preparation does not change the production decision above.

`piano-neural-comparison.test.ts` is owned by the existing shared/music CI unit
glob. It checks contact identity, ties/unisons, invalid outputs, preserved anchors,
independent held-key conflicts, ranked feasible selection and fallback behavior.
The actual downloaded-model and browser comparison is a manual research experiment
with optional isolated dependencies. No CI/Nightly lane, app dependency or
mandatory network/model download was introduced.

Use Node 24 and a separate Python environment with PyTorch 2.11.0. From the repo
root, set `PIANO_PYTHON` to that interpreter and follow the commands in
`packages/music-practice/scripts/piano-neural/README.md`. Model hashes and the
frozen protocol are versioned beside those scripts. Raw outputs remain under
ignored `work/neural-piano/`; the compact numeric report is committed for review.

Initial browser diagnostics caught a wrong relative harness path and TSX's
`__name` helper escaping into a serialized callback. Both were experiment harness
defects, corrected before successful conformance runs. Failure artifacts remain
in `work/browser-results/browser.mts-{chromium,webkit}-*`. The initial typecheck
also exposed a literal runtime URL that TypeScript tried to resolve as a local
module, plus stale worktree dependencies missing current main's `pdf-lib`. The
URL is now runtime-supplied and the lockfile dependencies were installed normally.
No assertion retries, relaxed tolerances or model/result changes were used.

## Ramoneda source notice

MIT License. Copyright (c) 2022 Pedro Ramoneda.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
