# Permissive piano fingering benchmark

This benchmark measures agreement with printed historical editorial digits,
physical/model coverage and abstentions. It supplements the independent search,
property, mutation, source-conversion and browser tests; editorial agreement is
not proof that a suggestion is right or wrong for every pianist.

## Corpus and provenance

152 cases / 24,141 note occurrences are derived from dacapo revision
`25754560a496c2beea3c81d72a389fb33fd7e930`. The MIT license, original data,
MusicXML source headers, notices, doubtful-reading documents and per-file SHA-256
manifest are retained under `test-fixtures/external/dacapo`. No downloaded program
was executed. The source editions are public domain; their electronic encodings
are MIT. Our Python standard-library importer reads JSON/XML only.

Coverage includes 36 major/harmonic/melodic scale forms, eight chromatic forms,
24 arpeggio forms, 20 five-finger studies, 54 technical sections and ten teaching
pieces by Türk, Beyer, Czerny and Schumann. The technical sections include
repeated notes, thirds and octaves. This is historical editorial evidence, not a
modern multi-pianist or hand-size-diverse expert benchmark.

Five explicitly synthetic pydactyl MIT fixtures, pinned to
`0ad656db9b778508453a7275dc698b9129ca765e`, separately exercise alternative
annotations and hard anchors. They are not included in musical agreement scores.
One toy input has two annotated digits for a single note per hand; our test
explicitly diagnoses that mismatch instead of applying it as a valid reference.
The rest of pydactyl's repertoire and its implementation were not imported.
PIG remains deferred; none of its data was downloaded or redistributed.

## Normalization and metrics

- Stable note IDs retain each attack, chord head, staff/hand and tie segment.
  Hands follow MusicXML staff ownership, including treble-clef LH notation.
  Backup/forward clocks, rests, divisions and ties are parsed explicitly. Written
  measures play once; repeat signs are not expanded. XML durations are notated
  key holds; articulation/pedal performance is not inferred. Tempo is standardized
  to quarter=60 for comparisons, not claimed to be a recorded performance.
- Hanon scale/arpeggio templates traverse up and down once with a shared turn.
  They use standardized sixteenth timing, including upstream's inferred closing
  tonic. Contrary-motion templates respect each hand's declared first direction.
  Studies retain perBeat (including triplets), closing holds, chord digits and
  the documented closing rest. These templates are not complete engraved scores.
- `printed`, `inferred` and `flagged` labels remain separate. Primary agreement
  uses printed digits only. Entire hand readings marked uncertain upstream are
  conservatively flagged, even where their readings were resolved. The documented
  D-major LH engraving anomaly and compound indications such as `4-5` are flagged.
  A compound digit never fabricates substitution timing or becomes a hard anchor.
  This conservative exclusion leaves relatively few eligible arpeggio digits.
- Reference digits are never passed to unconstrained inference. Every note is
  retained in its planning context, including unannotated notes and other voices.
  The score records total and predicted notes, eligible and covered labels,
  exact matches, flagged/inferred counts, diagnostics and every mismatch.
- `agreementSupported = matches / covered`; `agreementAll = matches / eligible`.
  Unsupported hands count against all-label agreement and coverage. Neither
  unsupported cases nor missing predictions silently disappear from denominators.
  A prediction with corrupted identity, duplicate IDs or an incomplete supposedly
  complete hand is rejected. Exact matching remains edition-specific: alternatives
  can be musically sound despite a mismatch.

## Partitions and experiment

Partitions were fixed before baseline inference: 110 development and 42 reserved
validation cases. Whole exercise numbers are reserved for studies; related
spelled tonic keys are grouped across scale/arpeggio modes. Four entire teaching
pieces are reserved. Different related musical patterns still occur across
partitions, so this is not a composer-independent or distribution-shift study.
The complete declaration is reproducible in our importer; all cases remain in
Nightly coverage.

The development baseline exposed expensive thumb passage: the model preferred
long five-finger runs because every crossing paid a full relocation cost.
A broad cheap-crossing experiment improved scales but hurt technical and teaching
pieces; it was rejected. The final shared correction applies to sustained
monotonic runs of at least seven separate attacks, with successive semitone or
whole-tone steps. Repeats, rests, held contacts, chords, leaps and short gestures
break that context. Within it, ordinary thumb passage uses a rolling-motion cost;
crossing over finger 5 retains a substantial penalty. There is no key, song,
exercise ID or reference-digit lookup in production. The legacy adapter and
reviewed editorial tables keep their previous model.

The musical model was frozen before examining validation results. Both the old
committed planner (`6e66f178bdfa429b3f8eac855b0d10304184eb1e`) and the final model
were evaluated on the same final normalized data. Baseline replay compiles only
our own historical source, never upstream FOSS programs.

| Partition | Eligible labels | Coverage | Baseline matches | Current matches | All-label agreement |
| --- | ---: | ---: | ---: | ---: | ---: |
| Development | 5,284 | 99.07% | 2,440 | 2,751 | 46.18% → 52.06% |
| Reserved validation | 2,134 | 100% | 1,136 | 1,352 | 53.23% → 63.36% |

No family loses exact matches in either partition. Gains are in scales and
chromatic runs; other families remain unchanged. One development chromatic case
remains unsupported because contrary-motion templates ask both hands to occupy
the same physical key. That conservative diagnostic was not disabled to improve
coverage. All 6,219 validation notes are planned; 98 development notes remain
unsupported. The detailed per-family results and data hash are in
[piano-benchmark-results.json](piano-benchmark-results.json).

Validation is now a regression set, not a permanently unseen holdout. Further
parameter tuning should reserve additional independent examples. Low remaining
agreement, especially arpeggios and specialized training patterns, remains visible.
There is no claim of expert approval, pedagogical optimality, universal technique
support, or statistical superiority on an unrelated repertoire population.

## Reproduction and regression owners

From the repository root with Node 24 and existing project dependencies:

```sh
python3 packages/music-practice/scripts/import-piano-benchmark.py --check
npx tsx packages/music-practice/scripts/evaluate-piano-benchmark.ts development /tmp/development.json
npx tsx packages/music-practice/scripts/evaluate-piano-benchmark.ts validation /tmp/validation.json
npx tsx packages/music-practice/scripts/evaluate-piano-benchmark.ts validation /tmp/baseline.json 6e66f178
```

No network is needed. Our importer can regenerate the normalized data explicitly
without `--check`; validation never rewrites source data, expected digits or
quality baselines. SHA-256 checks detect unreviewed source changes.

CI's shared unit glob owns bounded real-source witnesses, provenance checks,
synthetic importer tests, denominator/identity tests, mirrored contextual motion,
and the five MIT synthetic reference inputs. An independent exhaustive oracle
recomputes the released-note rolling optimum; compiling context/cost mutations
must fail assertions. Existing mono/polyphonic oracles and thirteen prior
mutations remain required. The silent Chromium/WebKit piano witness additionally
checks long-run thumb-passage cues alongside the existing chord, overlap, hidden
voice, substitution, music-preservation and editorial routing contracts.

The complete corpus is independently registered once in SongAlong Nightly's
Chromium group as `tests/piano-benchmark.corpus.ts` (a port-free, audio-free unit
command, not browser-dependent). It retains per-case diagnostics/mismatches in
`apps/songalong/work/piano-benchmark/results.json`, requires the complete declared
corpus and eligible-label counts, prevents coverage loss, and guards each family's
recorded agreement floor in both partitions. It never runs twice under different
browser engines. The policy/resource inventory and policy tests own this choice.

The next implementation recovers individually locatable source digits, adds
separately labelled Beringer completed references, and retains the original
eligible-ID floors. See [the ergonomics experiment](piano-ergonomics.md) and its
new report for current counts, candidate regression results and default policy.
The original measurements above remain the historical, pre-recovery experiment.
