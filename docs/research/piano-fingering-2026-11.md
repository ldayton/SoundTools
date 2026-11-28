# Piano fingering research: archived findings

Archived 2026-11-28. **Decision: the learned scorer did not demonstrate enough practical improvement to replace classic planning.** This is a research record, not approval to activate the archived implementation. This documentation change brings no implementation from the research branch onto main.

## Where to find the work

- Archive branch: [`archive/piano-fingering-2026-11-28`](https://github.com/ldayton/SoundTools/tree/archive/piano-fingering-2026-11-28).
- Snapshot tag: `research/piano-fingering-v3-2026-11-28`.
- Immutable research commit: `ae42053086b117ee724f160fa0ba73c09c15d148`.
- [Full V3 findings](https://github.com/ldayton/SoundTools/blob/ae42053086b117ee724f160fa0ba73c09c15d148/docs/piano-unified-v3.md), [benchmark results](https://github.com/ldayton/SoundTools/blob/ae42053086b117ee724f160fa0ba73c09c15d148/docs/piano-unified-v3-results.json), and [app audit](https://github.com/ldayton/SoundTools/blob/ae42053086b117ee724f160fa0ba73c09c15d148/docs/piano-unified-v3-app-results.json).

Earlier neural, hybrid, scalar/structured and native Chirality comparisons, frozen protocols, importer code, source reservations and intermediate failures are retained in that history. Raw work directories, external model artifacts, CI/browser evidence and a verified Git bundle are backed up privately outside the workspace under the archive name `piano-fingering-2026-11-28`. The backup has a per-file SHA-256 inventory and restoration instructions. Reinstallable dependency directories are excluded. Raw models and logs are not public repository assets; the archive does not change upstream code, data or model terms.

## What the results establish

These numbers describe the frozen research snapshot, not today's catalog or planner.

| Check | Finding |
| --- | --- |
| Protected scale, chromatic, five-finger and repertoire cases | All 112 individually avoided regression. |
| Untouched Schumann + Czerny Op.840 validation | Printed matches rose from 201 to 202, in one study. Both planners covered 345 of 1,165 eligible printed digits; unsupported pieces stayed in the denominator. |
| Thirteen piano editions across twelve key shifts | Eleven digits changed in six of 156 cases. All thirteen original-key editions were unchanged. |
| Physical/identity checks | No detected physical conflicts; app pitches, timing, holds and authored anchors were preserved. This does not establish superior human comfort. |

The final candidate passed its declared numeric gates, including strict aggregate fresh improvement, but a one-digit independent gain is weak evidence. The app audit compares the candidate with the shared classic planner used in the research implementation, not with older published UI callback tables. Improvements on consumed technical exercises did not establish a broad product win.

## Lessons to carry forward

1. **Use a complete timed physical representation.** Ties, simultaneous voices, held fingers and same-onset unisons belong to one hand timeline. Hiding a staff must not remove its constraints. Keep genuine source fingerings distinct from generated hints and internal generated constraints.
2. **Protect behavior explicitly.** Retaining classic costs in a recognized passage did not preserve its digits: neighboring learned preferences changed the global optimum. Generated constraints can preserve an established idiom, with source anchors retaining priority. Keep geometry/feasibility separate from preference scoring and return explicit complete fallbacks on unsupported input or exhausted bounds.
3. **Respect model applicability.** The native sequence objective was not calibrated for chord-to-line transitions. The final research policy used monophonic physical phrases separated by real hand silence; polyphonic phrases retained classic digits. A chord in another phrase must not disable an eligible earlier line. This is an experimental scope rule, not a mandate for current production code.
4. **Inspect individual cases and practical impact.** A five-digit aggregate family loss hid a seventeen-digit exercise regression offset by twelve gains elsewhere. Compare per-case digits, complete hands/cases, transitions, coverage and actual app editions against a pinned main baseline. Zero detected conflicts and higher reference agreement are useful checks, not proof of universal musical superiority.
5. **Validate imports independently.** LilyPond `q` chord repetitions were initially skipped by our AST walker, dropping attacks and shifting time. Expand them for extraction, while letting an independent MIDI interpreter perform its own native expansion. Keep ambiguous annotations and unsupported ornaments/cross-staff/tie cases visible, with original rows and eligibility retained.
6. **Use the product's transposition path.** Pair `visualTranspose` and `midiTranspose`; assert every pitch shift, onset and hold. ABC string rewriting with `strTranspose` failed that contract in the extra app audit.
7. **A working runtime is not a quality result.** The TypeScript port, exact bounded search, immutable musical-input caching and worker/stale-result contracts were testable engineering progress. Their existence did not justify changing the default scorer. Any future reuse should be a separate scoped change with current tests, terms and measured benefit.

## Evaluation data is now consumed

Hanon, Beringer, the earlier repertoire/Czerny Op.821 references, Burgmüller Op.100, the reserved Schumann Op.68 files and Czerny Op.840 studies have all been observed. The archived reservations identify exact files, exclusions, revisions and hashes. They remain regression/development evidence; do not tune against them and describe a subsequent result as independent validation.

Reserve new material before further model/policy selection. Freeze the policy and acceptance criteria before inference, retain failed attempts, include unsupported cases in denominators and distinguish authored printed labels from completed/inferred references. Preserve the actual baseline revision and verify that adapters do not change prediction identities. No human-review prerequisite was imposed by this investigation.

Current source and CI may differ from the archived snapshot. Read the pinned report and inspect the current planner before porting any portion; do not merge the research branch wholesale.
