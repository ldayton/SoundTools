# Piano ergonomics implementation and promotion decision

## Delivered behavior and default policy

The production default remains `model: "classic"`. It now permits a thumb/fourth
finger octave within the configured hand span, instead of rejecting this printed
technical fingering. Existing mono compatibility/editorial tables are unchanged.
Explicit staccato in generated score conversion shortens key hold to half the
notated duration, while retaining the notation clock and a separate
`notatedDuration`. Written ties retain their complete holds. Staff/voice identity
is carried into planning; notation, audio and persistence are not rewritten.
Externally supplied fixed digits now engrave when there is no native authored
digit to display; real authored digits remain authoritative without duplicates.

`model: "ergonomic"` is implemented as an explicit **experimental opt-in**, not a
new UI setting or an automatic fallback. It was not promoted: fresh-source
arpeggios and a technical family regressed despite gains on other data. This is
an intentionally retained comparison model with regression ownership, not a claim
that its weights are a better general default.

## Central architecture

- `piano-ergonomics.ts` owns practical/relaxed/comfortable finger-pair ranges,
  key-depth preferences, preparation estimates and three-attack preferences.
  Numeric span categories are reference data from Parncutt's published model,
  as transcribed in MIT pydactyl; its license and attribution are retained in
  `test-fixtures/external/pydactyl`. No external implementation was executed.
  Physical white-key distance and semitone span remain separate quantities.
  A wrist anchor is a discrete search coordinate, not an anatomical measurement;
  pair ranges allow expansion/compression around the nominal finger positions.
- Both models use the same timeline, identity, hard key ownership, held-finger,
  tie, fixed-digit and diagnostic contracts. A smaller maxSpan still restricts
  grips. A black-key thumb is a preference question, not an unconditional ban.
- `solvePianoMemoryPath` is an exact history-aware dynamic program. It merges only
  identical current candidates with equivalent future-relevant memory. The
  classic adapter keeps the existing first-order solver. State count and attempted
  transitions are bounded; exhaustion is explicit, never an approximate hidden
  beam or a fabricated fingering. Repeated static grip transitions are cached;
  costs are not recomputed separately for equivalent histories.
- Melodic memory keeps the last two unambiguous moving attacks and their digit
  choices. Input attack identities/voice membership are fixed at each layer;
  only speculative digits vary in the memory key. Explicit phrase starts, rests,
  changed voices and ambiguous multiple attacks reset it. A known moving voice
  can coexist with held contacts, whose fingers remain reserved. Interleaved
  voices do not silently receive invented melodic links. This is a conservative
  context model, not arbitrary long-distance per-voice biomechanical memory.
- Context scores include awkward outer spans, weak-finger triples and recurring
  single-note alternations. Preparation estimates the reach of free fingers toward
  an upcoming grip. These are soft preferences; hard anchors still win. A more
  general recurring-chord consistency extension was measured and rejected because
  it worsened technical references. There is no pattern lock or exercise lookup.
- Named `comfort`, `context` and `preparation` costs accompany the existing
  posture, movement, repeat, crossing and substitution breakdown. Experimental
  weights remain available for explicit ablations. No performance probabilities
  or human approval are inferred from those costs.

## Evidence and measurement

The original 152-case / 24,141-note corpus is unchanged musically. Its primary
editorial labels increase from 7,418 to 7,947: only numerically locatable doubtful
indices are excluded individually; prose-only locations still flag the entire
hand. Inferred digits, compound substitutions and the suspected engraving anomaly
remain separate. The original eligible IDs are retained in
`piano-benchmark-v1-labels.json`, and all original per-family production floors
remain enforced against that exact subset. The old report is historical and is
not overwritten to hide the denominator change.

72 Beringer references / 6,672 notes are added from the same pinned MIT pydactyl
revision, with complete source headers, hashes and attribution. They are credited
to Beringer/Dunhill (1900), transcribed by David Randolph. Their headers state that
gaps were filled, without distinguishing all printed locations. Their evidence
kind is therefore `completed`, never printed editorial gold. Whole alternatives
are compared as sequences; the scorer cannot construct an artificial perfect
reference by taking a different source's digit at each note.

The 24 broken-chord cases are development data. All 48 arpeggio cases were
reserved from optimization measurement until the candidate was frozen. No PIG
or other restricted dataset was imported. Historical validation was already a
regression set; it was not misrepresented as unseen. After this experiment the
new-source validation is also consumed and must not be repeatedly tuned against
as a fresh holdout.

| Evidence / partition | Eligible labels | Default classic | Experimental ergonomic |
| --- | ---: | ---: | ---: |
| Expanded printed development | 5,615 | 51.72% | 57.47% |
| Expanded printed historical validation | 2,332 | 59.65% | 70.11% |
| Completed Beringer broken chords, development | 1,536 | 77.08% | 84.18% |
| Completed Beringer arpeggios, fresh validation | 5,136 | 43.73% | 41.53% |

Coverage remains 100% for both validation groups and for Beringer development.
One prior development contrary-motion hand conflict remains explicit. On the
historical printed validation, technical matches fall 161→142 and repertoire
matches 69→67 under the candidate. These losses and the fresh arpeggio decline
reject general promotion; the larger aggregate Hanon gain does not conceal them.
Per-case macro agreement, per-family counts, exclusions and source hashes are in
[piano-ergonomics-results.json](piano-ergonomics-results.json).

Earlier development-only trials included broader resting finger offsets,
feature ablations and a recurring-chord extension. They were rejected before the
fresh validation decision. Finger-pair comfort alone is not sufficient evidence
of improved pedagogy; technical exercises sometimes deliberately train difficult
fingers. No claim compares these percentages to PIG or published neural results:
the data, annotation density and metrics differ.

## Diagnostics and reproduction

`comparePianoReference` evaluates unconstrained output first, then separately
constrains complete reference alternatives. It reports selected/reference costs
and terms, cost gaps, and whether a case is unsupported, unrepresentable,
equally preferred or ranked differently. Reference constraints never leak into
unconstrained generation. A reference-feasible path is not proof that every
unannotated note was chosen well.

```sh
python3 packages/music-practice/scripts/import-piano-benchmark.py --check
npx tsx packages/music-practice/scripts/import-piano-beringer.ts --check
npx tsx packages/music-practice/scripts/audit-piano-benchmark.ts hanon hanon-study-53-30
PIANO_MODEL=classic npx tsx packages/music-practice/scripts/evaluate-piano-benchmark.ts development /tmp/default.json
PIANO_MODEL=ergonomic npx tsx packages/music-practice/scripts/evaluate-piano-benchmark.ts validation /tmp/candidate.json working beringer
```

Only our own code and existing project parsing/tool dependencies execute. The
upstream builders, optimizers, training programs and tests are not executed.
No external trained model or downloaded runtime is needed.

## Regression ownership

CI's shared music unit glob owns pair comfort/reach, fourth-finger octaves,
mirrored hands, held voices, black-key depth, chord preparation, explicit phrase
breaks, staccato holds, whole-reference metrics, located uncertainty, and bounded
history states. Independent exhaustive oracles cover the experimental costs and
short complete paths; seeded mirrored/representation witnesses retain anchors.
Compiling mutations must expose wrong comfort arithmetic and incorrect memory
merging. All existing mono/polyphonic/rolling oracles and mutations remain owned;
the resource-cap mutation was made specific to its classic solver call when the
second solver was introduced, rather than silently testing a different site.

The existing silent Chromium/WebKit piano witness now verifies generated fixed
fourth-finger octaves, retained notation, separate staccato holds, voice metadata
and both explicit model routes. Native editorial digits remain covered separately.
The existing independently registered Nightly corpus command runs all 224 cases,
compares original production floors, and retains separate new-data floors for
both default and candidate models. It records every mismatch and diagnostic in
`apps/songalong/work/piano-benchmark/results.json`; no required cases or assertions
were removed to obtain a pass. This remains one unit command with no audio/ports,
not a duplicated browser task or a new tier.

Before any future promotion: acquire another independent reserved reference group,
inspect complete-phrase alternatives and controlled ablations, and resolve the
observed arpeggio/technical regressions. This release does not tune after seeing
the reserved results or automatically enable the candidate.

## Research references

- Parncutt et al. (1997), *An Ergonomic Model of Keyboard Fingering for Melodic
  Fragments*: https://static.uni-graz.at/fileadmin/_Persoenliche_Webseite/parncutt_richard/Pdfs/PaSlClRaDe97_FingeringModel.pdf
- MIT pydactyl, pinned 0ad656db9b778508453a7275dc698b9129ca765e:
  https://github.com/dvdrndlph/pydactyl
- PianoPlayer, studied at 6fb0e2114d7b21f75c0be5208172e1243a57323e:
  https://github.com/marcomusy/pianoplayer
- Nakamura et al. (2020), *Statistical Learning and Estimation of Piano Fingering*:
  https://arxiv.org/abs/1904.10237
- Randolph et al. (2023), *Modeling Piano Fingering Decisions with Conditional
  Random Fields*: https://nlp.lab.uic.edu/wp-content/uploads/sites/314/2023/06/Randolph_CRF2.pdf

## Follow-up phrase and movement evaluation

See [the phrase evaluation](piano-phrase-evaluation.md) for retained phrase metadata,
rejected movement candidates, development ablations and current validation evidence.
The table above records the original experiment before that follow-up.
