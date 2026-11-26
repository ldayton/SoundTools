# Regional piano ranking: V3 findings

V3 fixes the known five-finger and repertoire regressions and passes the frozen numeric benchmark gates. It does **not** establish a clear overall improvement for SongAlong. The independent fresh gain is one printed digit in one study; the thirteen app editions are unchanged in their original keys. Keep the shared classic planner as the product default and retain this scorer as research. No human review is required for that decision.

## What changed

V2 lost seventeen printed matches in one exercise while gaining twelve in another, so its five-digit family loss understated the regression. A compact hand position can skip an intermediate key, and repeated/oscillating notes still establish a stable position. V3 recognizes at least four attacks on at most five distinct keys, spanning at most a major sixth (nine semitones and five keyboard coordinates). Chromatic recognition is unchanged.

Keeping classic *costs* in a protected region did not keep its digits: neighboring learned preferences changed the global optimum. V3 now supplies internal generated digit constraints from the complete classic plan for protected contacts, including tie/unison aliases. These constraints are distinct from genuine printed source anchors and never rewrite caller input or provenance. The same exact bounded physical graph optimizes eligible contacts.

Consumed Czerny checks also exposed an applicability problem at chord-to-line transitions. Learned sequence preferences now apply only within monophonic physical phrases. A real silence for that hand separates phrases; any overlapping contacts keep their connected physical phrase on classic digits. A chord after a rest does not disable an earlier eligible phrase. This is a structural rule, with no song/family lookup. Search failure still returns an explicit complete classic fallback.

The iteration used consumed material for development and froze the final policy at `7624f81d` before fresh inference. No training, coefficient sweep or fitting of the twelve published weights occurred. Intermediate attempts and failures are retained in [development evidence](piano-unified-v3-development.json). The additional technical reservation preceded the final source-only regional-scope correction; no fresh predictions or reference agreement informed it.

## Evidence

The comparison uses a bundled copy of `origin/main` at `8ec11658`, with its revision/hash retained. On every supported benchmark case, the branch's classic planner is also required to produce exactly the same planned notes as that module. The complete candidate retains all identity/anchor and physical checks.

| Evidence | Classic | V3 |
| --- | ---: | ---: |
| Consumed printed references | 6,045 / 9,653 | 6,192 / 9,653 |
| Consumed Hanon printed arpeggios | 164 / 567 | 305 / 567 |
| Consumed five-finger references | 2,932 / 3,439 | 2,932 / 3,439 |
| Fresh Schumann | 44 / 88 | 44 / 88 |
| Fresh Czerny Op.840 | 157 / 1,077 | 158 / 1,077 |
| Combined fresh | 201 / 1,165 | 202 / 1,165 |

All consumed family totals are nonregressing. All **112 protected scale, chromatic, five-finger and repertoire cases** preserve or improve digit agreement, whole cases, whole hands, adjacent transitions and coverage individually. Consumed printed complete cases increase from 13 to 14, complete hands from 38 to 45 and matched adjacent transitions from 2,839 to 2,937. Completed-reference evidence is reported separately and is secondary.

The fresh comparison contains all eighteen reserved Schumann editions and all ten Op.840 studies. Sixteen ornament/cross-staff/unsupported pieces remain in the denominators. Twelve pieces have notation supported by the importer; twenty complete hands and 345 printed digits receive predictions from either method. There are zero detected physical conflicts and no coverage increase or decrease. Among those covered digits, agreement changes from 201/345 to 202/345. Only Op.840 No.5 improves, by one digit and one adjacent transition; the other twenty-seven pieces have identical match totals. This is weak generalization evidence, despite passing the predeclared strict-positive aggregate gate.

Source selection was fixed without planner results. Schumann No.1 was excluded because its musical identity was already consumed; No.32 is a nested multi-file edition outside that reservation's single-file scope. All other directly contained `.ly` editions were reserved at `fccf6f69`. Import revealed only 88 unambiguous printed digits, so all ten available Op.840 editions and all sixty dependencies were additionally reserved at `71873379` before any fresh inference. Each fresh collection must remain nonregressing and their combined result must improve. The additional selection and criterion were recorded before scoring. Upstream PIG-training overlap cannot be certified.

Both fresh collections use a common 120 BPM planning profile. These results do not establish quality across performance tempos. Ambiguous chord-level digits stay flagged; label rows never enter inference notes. Schumann source and converted records retain their respective CC BY-SA 2.5/3.0 attribution and license notices; Op.840 headers state Public Domain. Nothing from these evaluation datasets is an app asset.

Full evidence: [benchmark results](piano-unified-v3-results.json), [app audit](piano-unified-v3-app-results.json), and the two [Schumann](../packages/music-practice/test-fixtures/external/mutopia-schumann/reservation.json) / [Op.840](../packages/music-practice/test-fixtures/external/mutopia-czerny840/reservation.json) reservations.

## Practical app result

The audit covers all thirteen registered solo-piano editions and twelve nearest-register semitone transpositions: **156 song/key cases**. It uses the actual product's `visualTranspose` plus `midiTranspose` path, verifies every pitch shift, start and hold against the original score, preserves source anchors and checks physical conflicts.

V3 changes **eleven digits in six transposed cases**, across In Christ Alone and I'll Fly Away. It changes no digits in any original-key edition. All 156 cases retain complete baseline/candidate plans and zero detected physical conflicts. There are no independent authored reference fingerings establishing that these eleven alternatives are better. This audit compares V3 to the shared classic implementation, not to the older published UI's legacy callback tables.

The engineering improvement is the common, constrained, testable pipeline. The learned scorer has a measurable technical-exercise benefit but does not yet justify a product-default change. Further tuning on these now-consumed corpora would not strengthen that conclusion. The published code/model terms boundary is unchanged, and no learned weights or research module is imported into the product runtime.

## Import and validation failures resolved

The first independent Op.840 MIDI check rejected our AST import: `q` chord-repeat shorthand was skipped, dropping attacks and shifting the following clock. The importer now invokes LilyPond's native chord-repeat expansion before walking events. The independent MIDI interpreter explicitly omits that preprocessing and expands `q` through normal scorification. A CI fixture landmark independently requires the repeated E/G attack at beat one of No.5. All three notation-supported Op.840 pieces now match the MIDI witness; all nine supported Schumann pieces match too.

Legacy visual directives are removed only from controlled music definitions. Upstream include/header/layout/MIDI/Scheme code is never executed. Nested numeric layout lists, literal spanner labels and inspected visual macros are handled explicitly. Grace/repeat/voice ties that the limited walker cannot resolve are recorded with their original event rows; the entire affected piece is unsupported for every model, with all labels retained. These limitations are visible in the inventory.

The first extra app audit used ABC string transposition, which failed the asserted pitch-shift contract. It was replaced with the product's existing paired visual/MIDI transposition path; the assertion remains. Failure evidence is retained in `work/piano-v3/midi840.log`, `app-all-keys-verified.log`, and the numbered import logs. Model scoring was not used to choose import fixes.

CI owners are the existing shared/music unit glob (`piano-unified`, `piano-czerny-import`) and the existing required `piano-fingering.browser.ts`. Units cover protected/generated constraints, repeated positions, chord-to-line scope, phrase independence, unsafe source rejection, all reservation hashes and the chord-repeat landmark. Real classic/research workers and rendering pass in Chromium and WebKit. The native imports, independent MIDI witnesses, exhaustive reference comparison and all-key app audit remain manual research evidence; they are not appended to the bounded CI lane.

## Reproduction

Use Node 24, LilyPond 2.26.0 and a Python interpreter with `mido` for independent MIDI verification. Published weights remain an explicitly supplied ignored artifact.

```sh
python3 packages/music-practice/scripts/piano-neural/import-schumann.py work/schumann-new
python3 packages/music-practice/scripts/piano-neural/import-czerny840.py work/czerny840-new
"$PIANO_PYTHON" packages/music-practice/scripts/piano-neural/verify-burgmuller-midi.py work/schumann-new
"$PIANO_PYTHON" packages/music-practice/scripts/piano-neural/verify-burgmuller-midi.py work/czerny840-new

mkdir -p work/main-baseline
git archive 8ec11658 packages/music-practice/src/piano-hand-model.ts packages/music-practice/src/piano-ergonomics.ts packages/music-practice/src/piano-phrase-fingering.ts | tar -x -C work/main-baseline
npx esbuild work/main-baseline/packages/music-practice/src/piano-phrase-fingering.ts --bundle --platform=node --format=esm --outfile=work/main-planner.mjs
PIANO_RELEASED_PLANNER=work/main-planner.mjs PIANO_RELEASED_REF=8ec11658 \
  npx tsx packages/music-practice/scripts/piano-neural/unified-v3-evaluate.ts \
  packages/music-practice/test-fixtures/external/mutopia-schumann/corpus.json \
  work/chirality/parncutt.json work/v3-new-results.json
npx tsx packages/music-practice/scripts/piano-neural/unified-app-audit.ts \
  work/chirality/parncutt.json work/v3-new-app-audit.json --all-keys
npm run ci -- --base origin/main
```

The evaluators refuse to overwrite reports. Current policy/evaluator/importer hashes match the first frozen fresh run; no policy changes were made after reading the new results.
