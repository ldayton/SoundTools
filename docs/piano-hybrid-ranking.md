# Hybrid piano fingering ranking

Implemented and evaluated; retained as an isolated research candidate. Human
review is optional and is not a prerequisite. The current production planner
remains the default because this candidate fails four automated regression gates.

## Fixed policy

`hybrid-protocol.json` was committed in `b40cbce5` before the first hybrid
evaluation. No weight search, family routing, reference-based candidate selection
or changes to pretrained weights were performed. The production music/planner
baseline is `7f4ef97c`; the original Lumikey beam-six predictions are reused.

For each supported hand, the candidate pool contains classic's complete sequence
and the six existing neural beam sequences. Identical sequences are deduplicated,
retaining classic. Invalid identity, digits or anchors fail closed. Complete-hand
feasibility is checked with the existing planner; held-finger/key conflicts get
an additional independent audit. Unsupported hands retain their diagnostics and
never drop supported output from the other hand. Ties and same-onset unisons
share one physical contact and expand back to every source note ID.

The fixed objective, minimized per hand, is:

```text
(-sequence log probability + 0.1 * physical planner cost) / contact count
```

Physical cost is the existing classic planner's total posture, movement, crossing,
repeat and other weighted costs. Neural likelihood is evaluated along each
candidate's own finger history. Proposed future digits do not become future
anchors; only original source anchors enter future model context. This is
especially important for fairly evaluating classic outside the neural beam.
Exact objective ties favor classic. Missing classic likelihoods are invalid,
not zero. This searches a bounded candidate set, not all finger sequences or
the exact joint neural/physical optimum.

## Full-corpus comparison

All 262 consumed cases, 39,264 source note occurrences and 16,704 eligible
reference digits are retained, including unsupported cases in the denominator.
This is a regression comparison, not a fresh holdout or a reproduction of a
published paper. Pretrained training overlap remains unknown. The machine-readable
report is `piano-hybrid-results.json`; it retains each family, evidence type,
original partition, case and gate.

| Metric | Classic | Earlier first-feasible shortlist | Hybrid ranking |
| --- | ---: | ---: | ---: |
| Reference matches | 8,758 | 10,684 | 10,878 |
| Overall agreement | 52.43% | 63.96% | 65.12% |
| Printed-reference agreement | 67.99% | 67.08% | 68.82% |
| Completely matched annotated cases | 13 | 5 | 11 |
| Completely matched annotated hands | 36 | 42 | 55 |
| Matched adjacent labelled transitions | 4,717 | 6,911 | 7,076 |
| Feasible hands under the current model | 522 / 524 | 522 / 524 | 522 / 524 |
| Covered reference digits | 16,655 | 16,655 | 16,655 |
| Independent physical violations | 0 | 0 | 0 |

Hybrid improves 142 cases, ties 72 and regresses 48 relative to classic. It selects
classic for 54 hands and a neural candidate for 468; two remain unsupported.

| Family | Eligible digits | Classic matches | Hybrid matches |
| --- | ---: | ---: | ---: |
| Hanon scales | 1,600 | 1,075 | 1,225 |
| Hanon chromatic | 1,070 | 736 | 629 |
| Hanon arpeggios | 567 | 164 | 394 |
| Hanon five-finger | 3,439 | 2,932 | 2,634 |
| Hanon technical | 1,070 | 344 | 443 |
| Hanon repertoire | 201 | 152 | 144 |
| Beringer arpeggios | 5,136 | 1,139 | 2,632 |
| Beringer broken chords | 1,536 | 880 | 1,222 |
| Beringer scales | 2,085 | 1,336 | 1,555 |

The declared gates require overall improvement with no losses in printed
agreement, individual families, sequence agreement, coverage or feasibility,
and no physical violations. Hybrid fails chromatic, five-finger, repertoire
and complete-case agreement. Its aggregate gain does not override those failures.
Human approval is not the reason for retaining classic.

The physical-cost term reduces total movement cost relative to the earlier neural
shortlist, but does not beat classic's physical objective: summed movement cost
is approximately 73,096 for classic, 100,768 for first-feasible and 97,535 for
hybrid. Hybrid has 12,500 move events and 529 repeated-note finger changes versus
classic's 8,579 and zero. Reference agreement therefore is not evidence that the
hybrid is uniformly easier or more comfortable. These are model-relative metrics.

## Validation and reproduction

The scripts README gives the exact preparation, true-likelihood scoring and
evaluation commands. Requests contain music, source anchors and candidate digits,
not reference labels. Preparation freezes note/input/protocol hashes and rejects
overwrites. Evaluation verifies frozen cases, candidate identities, weights and
source-note hashes before calling the scorer. Full candidate audits are retained
under ignored `work/neural-piano-hybrid/`.

`piano-hybrid-ranking.test.ts` is owned by the existing shared/music CI unit glob.
It checks a small independently computed objective oracle, physical/likelihood
tradeoffs, exact ties, invalid scores, duplicate sequences, missing classic
output, source metadata, ties/unisons, reach, conflicting hands, partial-hand
coverage and automatic rejection of hidden family/evidence/sequence regressions.
No CI/Nightly lane, model dependency or production behavior was added.

The manual Python adapter suite checks real-weight beam rescoring and independently
calculates the likelihood of a specified path. All five adapter tests pass.
The full corpus checks note identity and source anchors for every output mode.
Model loading uses pinned weight hashes and the existing restricted tensor loader.

The first run's observed Mac timings were about 1.1 seconds for classic planning,
2.8 for first-feasible and 8.7 for hybrid ranking across the corpus. True likelihood
scoring added 44.7 seconds; the reused original greedy/beam inference took 56.4
seconds. These components are reported separately, not as browser/phone latency.
The committed replay report retains its own measured planning timings.

An initial preparation diagnostic rejected the historical Lumikey artifact's
omitted `pitchShift` field. The existing inference convention treats an omitted
shift as zero, so preparation now does the same and still rejects nonzero shifts.
No result assertion was retried, threshold relaxed or policy retuned.

Final research validation passes 18 shared research unit tests, five real-weight
Python adapter tests, the SongAlong TypeScript check and a committed-source
full-corpus replay with identical per-case decisions and metrics. The full local
CI attempts did not complete: both exceeded the 60-second budget and cancelled
the DoReGo desktop browser owner; all other owners passed. First failure,
diagnostic run, timings and remaining uncertainty are retained in
`testing-instability.md`. This is not a passing CI claim, and nothing was pushed.

The next useful experiment is a richer constrained search or a preference cost
that addresses these specific sequence regressions, evaluated under a newly
declared protocol and eventually additional reserved published references.
Nothing depends on receiving human feedback. Deployment rights for the external
weights remain a separate unresolved issue documented in the original comparison.
