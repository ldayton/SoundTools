# Hybrid piano fingering ranking

The corrected **v3** research ranker passes all declared automated regression
gates. Human review is optional and is not a prerequisite. Its default now
requires a measurable simplification before changing the current fingering.
The product still uses classic: this change does not add a neural runtime or
external weights to the app.

## Correction and tradeoff

The original likelihood/physical-cost ranker improved aggregate agreement but
introduced extra relocations, crossings and repeated-note finger changes in
simpler passages. Its 65.12% overall score hid chromatic, five-finger and
repertoire regressions and fewer completely matched passages.

V2, declared before its trial in `hybrid-v2-protocol.json`, rejected any increase
in those three action counts. It restored chromatic and repertoire agreement,
but equal-complexity renumbering still lost 24 five-finger reference matches.
Its 8,967 total matches and 12 completely matched passages failed the original
family and sequence gates. The full diagnostic remains at
`work/neural-piano-hybrid-v2/results.json`.

V3 was then declared in `hybrid-v3-protocol.json`. A neural candidate must strictly
reduce at least one action count while increasing none. Otherwise classic stays.
This rule applies to every hand; selection never receives a family, song name,
reference label or case-specific override. Equal-complexity renumbering is no
longer a reason to override the existing planner. The failed v1/v2 policies remain
explicit research options; callers and the evaluator default to v3.

The candidate pool and scoring remain unchanged: classic plus the six frozen
Lumikey beam sequences per supported hand, with true sequence likelihood computed
under each candidate's own history. Proposed future digits never become future
anchors. Among admissible complete hands, minimize:

```text
(-sequence log probability + 0.1 * physical planner cost) / physical contact count
```

The physical weight was not swept or retuned. Identity, anchors, ties/unisons,
reach, complete-hand diagnostics and the independent held-key/finger audit remain
required. Exact objective ties and duplicate sequences retain classic.

## Full comparison

All 262 consumed cases, 39,264 source note occurrences and 16,704 eligible digits
remain in the denominator. No product music or reference labels changed. This is
iterative development on consumed data, not a fresh holdout, human approval or a
reproduction of a published paper. Pretrained training overlap remains unknown.

| Metric | Classic | Original hybrid v1 | Corrected hybrid v3 |
| --- | ---: | ---: | ---: |
| Total reference matches | 8,758 | 10,878 | 8,879 |
| Overall reference agreement | 52.43% | 65.12% | 53.15% |
| Printed-reference agreement | 67.99% | 68.82% | 68.89% |
| Completely matched annotated cases | 13 | 11 | 13 |
| Completely matched annotated hands | 36 | 55 | 36 |
| Matched adjacent labelled transitions | 4,717 | 7,076 | 4,814 |
| Feasible hands under the current model | 522 / 524 | 522 / 524 | 522 / 524 |
| Covered reference digits | 16,655 | 16,655 | 16,655 |
| Independent physical violations | 0 | 0 | 0 |

| Family | Eligible digits | Classic matches | Original hybrid | Corrected hybrid |
| --- | ---: | ---: | ---: | ---: |
| Hanon scales | 1,600 | 1,075 | 1,225 | 1,147 |
| Hanon chromatic | 1,070 | 736 | 629 | 736 |
| Hanon arpeggios | 567 | 164 | 394 | 164 |
| Hanon five-finger | 3,439 | 2,932 | 2,634 | 2,932 |
| Hanon technical | 1,070 | 344 | 443 | 344 |
| Hanon repertoire | 201 | 152 | 144 | 152 |
| Beringer arpeggios | 5,136 | 1,139 | 2,632 | 1,139 |
| Beringer broken chords | 1,536 | 880 | 1,222 | 880 |
| Beringer scales | 2,085 | 1,336 | 1,555 | 1,385 |

V3 passes the unchanged gates: overall improvement, no loss on printed references,
any source-qualified family, sequence metrics, coverage or feasibility, and zero
independent physical violations. The three requested family regressions are
removed. It improves 13 individual cases, ties 245 and regresses four scale cases
by 15 reference digits in total; no claim of per-case dominance is made. Those
four cases remain visible in the report and denominator.

The improvement is deliberately more conservative. V3 selects classic for 498
hands and a neural candidate for 24; two remain unsupported. It gives up much
of v1's completed-transcription gain while slightly improving printed agreement.
Counts fall from 8,579 to 8,566 relocations and 3,743 to 3,654 crossings; repeat
changes stay zero. Summed movement cost is approximately 73,696 versus classic's
73,096, so fewer events do not imply lower travel cost or proven human comfort.

## Reproduction and validation

`piano-hybrid-v3-results.json` retains the complete corrected comparison, every
gate, source/implementation/input/weight hashes, timings and per-case metrics.
The original `piano-hybrid-results.json` remains the unchanged v1 record.
The scripts README gives preparation and sequence-scoring commands. Reuse the
frozen, label-free requests and likelihoods; the correction needs no new weights
or inference run:

```sh
npx tsx packages/music-practice/scripts/piano-neural/hybrid-evaluate.ts \
  work/neural-piano work/neural-piano-hybrid work/neural-piano-hybrid-v2/replay.json --v3
```

Use `--v1` or `--v2` only for historical replay. Full candidate rejection/selection
audits are retained separately under
`work/neural-piano-hybrid/audit-hybrid-ranking-3.json`.

The existing shared/music CI unit glob owns the new bounded synthetic regressions:
added movements lose despite overwhelming likelihood, equal-complexity changes
retain classic by default, a genuine count reduction remains selectable, event
kinds are counted independently, and renamed IDs do not alter selection. Existing
identity, feasibility, likelihood, source metadata and automatic-gate tests remain.
The 21 research unit checks and SongAlong typecheck pass. No new human feedback
is required. All full-corpus metrics were replayed from the committed implementation.

## CI budget repair

The retained failures in `testing-instability.md` cancelled the late DoReGo desktop
browser command at the 60-second boundary. Its four live-drone control scenarios
now have a required independent `drone-controls.e2e.ts` owner on port 4710. The
same helper and assertions cover source identity, scheduled stop, gain routing,
controls, playhead continuity and persistence at both viewport sizes and both
scale types. They measure no PCM, hardware latency or timing precision and can
run alongside the precision-audio desktop owner, whose realtime-audio lock stays.

CI explicitly requires this command. Nightly and the developer browser alias use
the same ten-suite registry and require it once per browser. Resource inventory,
coverage union and lock tests were updated together; the 31 focused policy checks
pass. No assertion, timeout or budget was reduced or relaxed. Because the execution
plan changed, the full coordinator is measured with `npm run ci -- --all`;
its exact outcome and retained evidence are in
`work/neural-piano-hybrid-v2/ci-all.log`.

The neural experiment remains offline research. Model deployment rights and
runtime integration remain separate work; human review is not a release gate.
