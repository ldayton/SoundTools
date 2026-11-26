# Piano fingering release review

## Decision and enabled scope

Release the conservative default after full local CI on the exact commit. Keep
`model: "ergonomic"` and nonzero gesture weights disabled. No publication is
implied by this document.

The branch adds complete timed-hand planning for generated notation: chords,
overlapping voices, held-finger reservations, ties/unisons, stable hand ownership,
hidden-voice constraints and explicit whole-hand failure diagnostics. The legacy
single-voice API and authored edition fingerings remain separate and authoritative.
Sustained stepwise runs receive shared thumb-passage handling. No song-specific
fix or exercise-ID lookup is present.

## Release blocker found and corrected

Earlier reports compared against an intermediate branch planner, not released
`main`. The direct review found a five-finger regression: on comparable passages,
released main matched 2,666 / 3,137 reference positions, while the pre-review branch
matched only 1,990. Its wider single-note poses and duration-weighted posture costs
changed the balance against relocation, despite aggregate gains elsewhere.

The corrected default retains the established narrow poses and per-attack posture
objective when a hand has no concurrent contacts. The tempo multiplier uses
quarter=60 as the comparison reference. Timed polyphonic grips retain their
wider candidate geometry and duration-sensitive objective. Both use the same exact
solver, key identities, hard constraints and movement implementation. This is a
structural mono/polyphonic contract, not a repertoire classifier or fallback to a
song-specific fingering. The experimental model is unchanged.

The correction deliberately gives up intermediate arpeggio/broken-chord gains to
restore reliable released behavior across five-finger, technical and repertoire
families. We do not claim arpeggio quality improved over main. Historical reports
remain unchanged and are explicitly superseded for release-default comparisons.

## Direct comparison with released main

Pinned main revision: `0a593873044a2145e9b99254911d480aadd5ed20`.
The baseline is our own released TypeScript, retained verbatim as a data fixture
and compiled only for evaluation. No third-party fingering implementation runs.
Its hash is checked in the registered Nightly comparison.

All 262 corpus cases are retained. 230 whole cases have no overlapping contacts
within either hand and can be compared with the old mono API. The other 32 are
listed explicitly as noncomparable; they remain covered by whole-hand tests and
the full corpus. These are historical editorial/completed-reference comparisons,
not fresh validation or a demonstration of universal pedagogical quality.

| Comparable family | Eligible labels | Main matches | Release matches |
| --- | ---: | ---: | ---: |
| Hanon scales | 1,600 | 632 | 1,075 |
| Chromatic | 1,070 | 407 | 736 |
| Hanon arpeggios | 567 | 164 | 164 |
| Five-finger | 3,137 | 2,666 | 2,666 |
| Technical | 792 | 248 | 248 |
| Teaching repertoire | 76 | 67 | 67 |
| Beringer arpeggios | 5,136 | 1,139 | 1,139 |
| Beringer broken chords | 1,536 | 880 | 880 |
| Beringer scales | 2,085 | 766 | 1,336 |
| **Total** | **15,999** | **6,969 (43.56%)** | **8,311 (51.95%)** |

That is 1,342 additional reference matches and no family losing matches against
main. Both versions receive the same final labels, whole alternatives and timing
conventions. No reference digits enter inference. Full per-case results, excluded
cases and the failed pre-review candidate are in `piano-release-results.json`.

Main emits suggestions for every comparable label. The release withholds 49
labels from a contrary-motion case where both hands claim the same physical key;
coverage is therefore 15,950 / 15,999. The comparison independently detects the
cross-hand overlapping key claims and requires `hand_conflict` diagnostics.
This safety exclusion remains in the denominator and is not hidden as an
old-API exclusion. No resource-limit or other unexplained coverage loss is allowed.

## Regression ownership and changed assertions

The previous default numeric floors described the intermediate timed model and
would preserve its five-finger regression. The first post-correction corpus run
correctly failed an old arpeggio floor (35 < 44 on the original development label
subset); evidence is `work/piano-release-review/corpus-first.log`.

Those default floors are replaced by the corrected full-corpus release floors,
plus an independent direct-main gate requiring a strict aggregate gain, no family
loss, immutable baseline hash, unchanged comparison/exclusion counts, and no
unexplained coverage loss. Original eligible-ID subsets remain executed with
separate corrected floors. Existing experimental/gesture floors remain required.
No cases, physical assertions, browser errors or failure diagnostics are removed.
The old comparison reports remain historical evidence, not current promises.

`piano-release.test.ts` independently specifies ordinary and stretched five-finger
patterns for both hands and checks old-API exclusions versus proven key conflicts.
The rolling exhaustive oracle now uses the corrected mono contract: narrow poses,
per-attack posture and quarter=60 movement reference. It still independently
enumerates complete paths, and both compiling rolling mutations remain killed.
The polyphonic independent oracle and seeded hard-constraint cases remain intact.
The renderer witness additionally checks reversed source chord order for correct
pitch-to-digit vertical association in Chromium and WebKit.

Reproduction:

```sh
npx tsx packages/music-practice/scripts/evaluate-piano-release.ts /tmp/piano-release.json
npx tsx apps/songalong/tests/piano-benchmark.corpus.ts
npm run ci -- --base origin/main
```

The release script and corpus command execute only our own current/historical
planner and existing project dependencies. No PIG/restricted data is imported.
The FOSS data, license notices and all earlier failed experiments remain explicit.

## Review verification before release CI

All 675 shared music tests pass. The expanded registered corpus passes the direct
main gate, all corrected release floors and unchanged experimental floors.
WebKit passes the extended renderer witness; Chromium is also required in full CI.
Visual inspection of reversed-chord and held-voice snapshots found the digits
associated with the intended pitches without changes to music. Snapshots are
retained under `work/piano-release-review/`.

The existing SongAlong source-melody catalog test now additionally compares every
legacy result, including transpositions -5, 0 and +4, with the pinned released
implementation. It passes exact digit, anchor and movement-cue equality, rather
than merely asserting reachability. This protects the legacy constructor used by
reviewed editions. Full local CI on the final committed revision remains the
final release-readiness check; this is not a claim that all Nightly groups ran.
