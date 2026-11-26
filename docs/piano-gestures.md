# Gesture-level piano fingering experiment

## Acceptance criteria, fixed before calibration

- Shared three-attack features represent signed spans, preparation and completion
  of thumb pivots. No exercise/song lookup or independently cheap edge discount.
- History cannot cross rests, explicit phrase starts, changed voices, chords or
  overlapping held contacts. These features never relax physical constraints.
- Exact decoding retains every future-relevant variable. Since features use only
  pitches, times, voices and digits, two-attack digit memory remains sufficient;
  anchors must not be used without extending the memory-equivalence key.
- Default classic and existing ergonomic results remain unchanged at zero gesture
  weight. New nonzero weights remain explicit experimental inputs.
- Independent numeric goldens, mirrored/reversed cases, an exhaustive short-path
  oracle, compiling mutations and a browser witness cover the candidate.
- Calibrate only on development groups using a fixed small weight inventory.
  Reject promotion if any development family loses matches or coverage. Select
  before measuring the reserved scale family. Record rejected candidates too.
- The unused Beringer scales are a reserved technique group from the same
  publication, not independent-source validation. No default promotion follows
  from those results. Existing validation is already consumed regression data.
- Preserve all existing floors and test ownership. Run the full piano corpus,
  relevant browser checks and full local CI on the final committed revision.
- Read external source only; import permissive reference data with license,
  hashes and attribution. Never execute upstream implementations or tests.

## Model

The signed comfortable/practical ranges are numeric reference data from
Parncutt's model, transcribed in MIT pydactyl at
`0ad656db9b778508453a7275dc698b9129ca765e`. The existing license and attribution
remain under `test-fixtures/external/pydactyl`.

The model is an original experimental combination, not a reproduction of the
published optimizer. It separates outer-span position-change count/size from
completed thumb-pivot preference and unstable repeated crossings. Exact acyclic
search permits a bounded negative preference for a completed gesture; that does
not make a physically impossible path feasible.

References:
- https://static.uni-graz.at/fileadmin/_Persoenliche_Webseite/parncutt_richard/Pdfs/PaSlClRaDe97_FingeringModel.pdf
- https://nlp.lab.uic.edu/wp-content/uploads/sites/314/2023/06/Randolph_CRF2.pdf
- https://github.com/dvdrndlph/pydactyl

## Results and decision

No nonzero weight met the predeclared development gate. Combined development
matches (5,615 printed + 1,536 completed reference positions) were:

| Gesture weight | Matches | Decision |
| --- | ---: | --- |
| 0 | 4,520 | Retain |
| 0.25 | 4,365 | Reject: five printed families lose matches |
| 0.5 | 4,388 | Reject: four printed families lose matches |
| 1 | 4,349 | Reject: four printed families and broken chords lose matches |

Weight 0.5 was the strongest nonzero development diagnostic and was frozen
before reserved-family evaluation; weight 1 was also a predeclared diagnostic.
No retuning followed validation. All retain full validation coverage.

| Consumed evaluation group | Existing ergonomic, weight 0 | Diagnostic, weight 0.5 | Diagnostic, weight 1 |
| --- | ---: | ---: | ---: |
| Printed historical validation, 2,332 labels | 1,635 | 1,516 | 1,461 |
| Completed arpeggios, 5,136 labels | 2,258 | 2,229 | 2,100 |
| New completed scale family, 2,085 labels | 1,247 | 1,108 | 1,002 |

The unchanged classic default matches 951 of the 2,085 scale labels (45.61%).
Existing ergonomic scores 59.81%, the weight-0.5 candidate 53.14%. The new scale
family supports the old model's scale strength but cannot overturn earlier
arpeggio/technical regressions or justify a general promotion.

On arpeggios, weight 0.5 improves adjacent labelled pair matches (1,213 to 1,265)
while losing individual digit matches, with zero completely matched annotated
hands in either model. This demonstrates why neither note matches nor adjacent
pairs alone establish coherent whole-phrase quality.

The candidate remains implemented behind the explicit research input
`{model: "ergonomic", weights: {gesture: ...}}`. Gesture weight defaults to zero;
no UI, stored preference, automatic fallback or default behavior enables it.
All original production and ergonomic floors stay required. Nightly now retains
separate diagnostic floors and new scale coverage, not substituted default checks.

## Data and metrics

The 38 pinned `.abcd` scale files contain 8,451 notes; all remain evaluated.
26 files contain no reference digits. The 12 labelled cases supply 2,085 eligible
positions, with a single individual unknown digit flagged. Missing alternatives
(`x@x`) do not invalidate known alternatives. If an individual position is unknown
in a supplied alternative, it is excluded consistently across supplied alternatives.
These are completed transcriptions, not printed-digit gold. Unlabelled notes
contribute to prediction/coverage counts, never invented agreement labels.

The shared scorer now reports complete annotated-case/hand agreement and adjacent
labelled attack agreement. “Complete” means all eligible reference positions,
not all unannotated digits. Pair metrics never bridge unlabelled positions,
phrase starts, rests, tied continuations or ambiguous same-voice chord ordering.
Whole source alternatives remain separate. These are reference-agreement metrics,
not human quality ratings or probabilities of correct playing.

`piano-gestures-results.json` retains compact per-family results, source/data hashes,
frozen selection and the rejection decision. Detailed mismatch reports remain
in `work/piano-gestures/` and the registered Nightly corpus output. No benchmark
label enters unconstrained inference.

## Reproduction and regression ownership

```sh
npx tsx packages/music-practice/scripts/import-piano-beringer.ts --scales --check
npx tsx packages/music-practice/scripts/evaluate-piano-gestures.ts development /tmp/piano-gesture-development.json
npx tsx packages/music-practice/scripts/evaluate-piano-gestures.ts validation /tmp/piano-gesture-validation.json /tmp/piano-gesture-development.json
```

The evaluation script checks the planner source hashes against the frozen
calibration report before running validation. The candidate features use only
the previous two digit choices, so existing exact memory equivalence remains
valid. Feature credit is bounded per gesture; negative edges are supported by
the acyclic solver. Chord/hold eligibility is a fixed property of input layers,
not speculative search state.

CI's shared music test glob owns independent signed-range numeric cases,
mirrored/reversed gestures, interruptions, held contacts, explicit opt-in and
cost accounting, resource limits, a compiling feature mutation and eight
independently enumerated complete-path optima. The independent oracle imports
no production feature helper. The shared reference-data tests own lossless,
hash-verified import, absent references and alternative uncertainty.
The existing CI/Nightly piano renderer witness exercises explicit research
routing, fixed digits and unchanged music. The existing Nightly piano corpus
command owns all default floors plus the frozen diagnostic weights and all
38 scales; no new alias, tier or skipped cases were added.

## Failure evidence

The first importer rejected the individually unknown digit rather than guessing.
The first uncertainty test then caught an absent alternative masking a supplied
one (27 unlabelled cases versus the independently counted 26). The importer now
separates absent alternatives from unknown positions. Initial validation output
is retained as `work/piano-gestures/validation.json`; corrected output is
`validation-corrected.json`. Model sources and frozen weights did not change.
The scale family is now consumed, including this import diagnosis.

The first WebKit fixture failed because the rendered tune contains cyclic
renderer objects. Its notation-preservation snapshot now selects written pitches
and durations, as the existing renderer fixtures do. Original failure artifacts:
`work/browser-results/piano-fingering.browser.ts-webkit-ca49ba8a`.
This was a fixture defect; the corrected witness is rerun without retries.

## Next decision

Do not keep tuning a global gesture strength on these references. The bounded
candidate is exact and testable but its objective is worse. The next useful
experiment is to separate feature weights and fit phrase-level rankings on
independently reviewed alternatives, with work/edition grouping. Broader context
or more search alone cannot fix a preference model that ranks references poorly.
Another independent annotated source is still needed before default promotion.

## Verification status before full CI

The expanded registered piano corpus passes with every existing floor and all
new diagnostic/scale floors. The corrected WebKit renderer witness passes.
The shared music suite passed before the final freeze-refusal test was added;
that test then passed independently and remains required by the shared CI glob.
All 38 retained scale files were independently verified against Git objects at
the pinned upstream revision, without executing that repository's code.
Full local CI on the committed revision is the final check, not implied by these
component results. This work does not claim the complete Nightly matrix ran.
