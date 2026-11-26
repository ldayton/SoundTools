# Piano cost audit

The production planner's preference model is the main target for improvement.
The audit covers all 262 consumed benchmark cases and 524 hands, keeping printed
and completed annotations separate. It compares unconstrained classic output
with the cheapest complete-hand path compatible with each whole reference
alternative. References enter only those diagnostic passes. Source anchors,
ties, durations, hand ownership and the planner's physical constraints remain.

The source and full numeric record are `piano-cost-audit-results.json`. The
production planner and its weights are unchanged. No model was trained.

## Printed annotations

There are 252 annotated hands, containing 7,947 eligible printed digits. Classic
matches 5,403 digits and disagrees on 2,544. Thirty-six hands match every supplied
printed label; 216 disagree on at least one label.

| Diagnosis of a disagreeing hand | Hands | Mismatched printed digits |
| --- | ---: | ---: |
| Reference-compatible path has a higher default cost | 186 | 2,342 |
| Reference-compatible path ties the default cost | 27 | 151 |
| Reference constraints are unrepresentable in the current model | 2 | 2 |
| Unconstrained inference is already unsupported | 1 | 49 |

Thus 213 of the 216 disagreeing hands have a reference-compatible path under the
current constraints. No constrained path was cheaper than unconstrained inference;
the audit detected no search-optimality inconsistency at its numeric tolerance.
Feasibility here is relative to the planner's model, not anatomical proof.

The two unrepresentable hands are in `hanon-study-53-30`, with a `reach`
diagnostic at beat 1.5. The annotated unsupported hand is the existing
`hanon-40-40` right-hand `hand_conflict` at beat 6. These remain visible and are
not removed from agreement denominators or silently repaired.

## Reweighting opportunities and feature limitations

Comparing the cost-component vectors of the two selected completions gives:

| Feature relationship | Hands | Mismatched printed digits | Interpretation |
| --- | ---: | ---: | --- |
| Some reference costs are lower, others higher | 145 | 1,766 | Different weights could favor this reference completion |
| Reference costs are no lower on any component | 41 | 576 | Nonnegative weights cannot favor this particular completion over the selected one |
| Feature vectors are identical within tolerance | 27 | 151 | Reweighting cannot distinguish these two completions |

These are comparisons of particular completions. Sparse labels leave other notes
unconstrained; a different weight vector can produce a different compatible
completion. The audit does not prove that all compatible paths in the second
or third row are impossible to favor. Nor does it prove that one shared weight
vector can resolve all 145 tradeoff pairs simultaneously.

| Printed family | Disagreeing hands | Tradeoff | Reference completion dominated | Same features | Unsupported / unrepresentable |
| --- | ---: | ---: | ---: | ---: | ---: |
| Scales | 69 | 39 | 9 | 21 | 0 |
| Chromatic | 14 | 13 | 0 | 0 | 1 |
| Arpeggios | 48 | 44 | 4 | 0 | 0 |
| Five-finger | 20 | 7 | 9 | 4 | 0 |
| Technical | 56 | 40 | 12 | 2 | 2 |
| Repertoire | 9 | 2 | 7 | 0 | 0 |

This supports a compact learned preference model with contextual features.
Scalar reweighting is a useful baseline, but the equal-feature and dominated-pair
cases show why it should be compared with local contour, repeated-pattern and
phrase-context preferences. Some context features already exist in the separate
experimental ergonomic model and can be reused rather than rebuilding the
planner. The audit does not identify a winning feature or justify relaxing hard
constraints. Reference disagreement also includes legitimate fingering alternatives.

## Completed transcriptions

The 168 annotated completed-reference hands contain 8,757 eligible digits, of
which classic matches 3,355. Of those hands, 167 have a higher-cost compatible
completion and one ties. The feature comparison gives 144 tradeoffs, 23 dominated
reference completions and one identical vector. These labels remain secondary
evidence; they are never relabelled as printed editorial digits.

The 52 unannotated hands in each evidence group stay in the coverage inventory.
They contribute no invented labels to agreement or training targets.

## Reproduction and coverage

```sh
npx tsx packages/music-practice/scripts/audit-piano-costs.ts work/piano-cost-audit/replay.json
node --import tsx --test packages/music-practice/tests/piano-cost-audit.test.ts
```

The report retains source/implementation hashes, every hand's annotations and
mismatch counts, reference-alternative indices, complete cost vectors, gaps and
diagnostics. Unannotated notes remain latent choices, never asserted reference
digits. Whole alternatives are kept separate. Source-fingering conflicts get a
`source-anchor-conflict` diagnostic instead of overwriting authored constraints.

`piano-cost-audit.test.ts` is owned by the existing shared/music CI unit glob.
Seven synthetic tests cover preference/tie/search-inconsistency separation,
reference rejection versus unsupported inference, immutable source anchors,
printed/completed separation, sparse annotation, coherent alternatives, feature
comparison and complete denominators. The existing ergonomic diagnostics tests
are retained. This optional corpus audit adds no CI/Nightly command or model
dependency. The final full local CI log is `work/piano-cost-audit/ci.log`.

## Next experiment

The audit makes a small learned-cost experiment worth pursuing. Reserve another
permissively reusable annotated collection before fitting. Use whole pieces or
source groups for separation, since randomly splitting repeated/transposed notes
would overstate independence. Fit on printed annotations with partial-reference
handling; keep filled-in labels secondary. Compare learned scalar costs against
contextual costs within the existing constrained search, retaining classic and
the same family, sequence, feasibility and runtime checks. New human review is
not required. The current consumed corpus remains development/regression data.
