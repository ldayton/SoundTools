# Isolated TypeScript Parncutt port

This is a browser-compatible research implementation of the native Chirality
Parncutt objective. It is not imported by SongAlong or selected as a product
planner. It needs neither Python nor NumPy at runtime. No published learned
weights are bundled: callers provide an explicit weight vector, or use the
uniform rule weights for isolated sequence experiments.

The port derives from Pedro Fillastre / vibetuned's
[Chirality](https://github.com/vibetuned/chirality/tree/cd9c54e0dcdfaf0677690f03978cd23ecd90da22)
`parncutt97.py` and `weight_learning.py`, and retains **AGPL-3.0-or-later** licensing
in this directory. See `LICENSE` and the SPDX headers. This does not change the
production planner's implementation. The separately published PIG-trained
weights retain their model card's research/nonprofit terms and stay in ignored
offline artifacts. Product activation/licensing and the known musical family
regressions remain separate work.

## Modules and contracts

- `rules.ts`: twelve pure Parncutt feature functions and immutable signed span
  tables. Semitone intervals mirror exactly once for the left hand; key colors
  do not mirror. Triple context is preserved. No training or data-loader code.
- `decode.ts`: exact native sequence dynamic programming with previous-two-digit
  state, strict deterministic first-minimum tie order and the native finite
  `1e8` practical-span penalty. It has 25 rolling cost states and 25 bytes of
  backpointers per note, plus five per-note costs. It never allocates the Python
  model's dense twelve-feature pair/triple tensors.
- `constrained.ts`: full-source physical checking with the existing planner.
  A complete native hand is accepted only when a fixed-input reconstruction
  succeeds; otherwise the classic plan remains. Ties, unisons, held notes,
  source anchors, source order and original metadata are retained. It reuses
  the existing browser-compatible contact normalizer from the evaluation
  utilities, rather than introducing a different tie/unison interpretation.

The sequence API accepts `{id, midi, finger?}` notes in intended chronological
order, one hand at a time. Authored `finger` values are hard choices, an extension
beyond upstream's unanchored native decoder. It rejects duplicate/empty IDs,
invalid MIDI/digits/hands, missing or extra rule coefficients and nonfinite,
negative or excessive weights. Weight coefficients are bounded to [0, 10000].

Default resource limits are 4,000 sequence notes and 500,000 attempted edges;
callers may lower them. An exceeded budget returns `status: "unsupported"`,
`reason: "search_limit"` and no partial fingering. It is not reported as an
optimum. The phrase adapter checks the original 8,000-note global limit before
contact normalization. Numerical costs use JavaScript float64, as native NumPy
weighted decoding does. No epsilon tie preference or beam pruning is used.

`gateViolations` is a native model penalty count, **not** simultaneous-key
feasibility. `evaluateParncuttPath` independently recomputes rule totals and
penalties along a selected path. Only the phrase adapter applies the existing
whole-hand physical constraints; the sequence decoder alone must not drive
product fingering annotations.

```ts
import { decodeParncuttSequence } from "./decode";
import { planParncuttPhrase } from "./constrained";

// A validated twelve-coefficient vector, provided by the caller.
const sequence = decodeParncuttSequence(
  [{ id: "a", midi: 60 }, { id: "b", midi: 62, finger: 2 }],
  "right", weights,
);
if (sequence.status === "complete") {
  // Raw native result, including objective cost and gate diagnostics.
  console.log(sequence.fingers);
}

// Timed source notes, both hands/voices included; no reference labels.
const { plan, selections } = planParncuttPhrase(sourceNotes, weights, { bpm: 80 });
```

## Validation

The existing shared/music CI unit glob owns
`packages/music-practice/tests/piano-parncutt-port.test.ts`. Its independent
synthetic fixture was generated from the pinned Python source, with no PIG
labels or published weights. It covers 4,900 pair grid entries, 3,125 triples,
90 per-note contexts and 52 decoded paths, both hands, key colors and signed
intervals. Impossible span/color combinations are retained in the fixture but
only physically realizable MIDI color pairs are passed to the MIDI-based API.
Tests also enumerate all digit paths for short anchored examples, validate
deterministic ties and limits, and check whole-hand safety/fallback behavior.

The optional full corpus comparison checks the actual published weight artifact
offline. All **1,112 hand/model comparisons** match Python finger-for-finger,
with zero objective differences; both uniform and published models are covered.
Complete path objectives are also compared in exact integer units of 1e-4 for
these reference vectors, so a different optimal tied path could be diagnosed
without hiding a cost regression. There were no such tied-path discrepancies.
The checked phrase scores are unchanged from the Python experiment: 349/694
Czerny, 5,636/7,947 old printed and 6,203/8,757 old completed digits. Existing
grace-note unsupported cases remain in all denominators.

Full numeric/source-hash evidence is in `docs/piano-chirality-port-results.json`.
The core and adapter bundle as browser ESM without Node/Python/NumPy imports;
the checked unminified bundle is about 48 KiB, with no model weights. The later
[unified planning milestone](../../../../docs/piano-unified-planning.md) adds a
shared cache/client contract and an optional research worker. Its composed
policy remains gated; production uses the classic shared planner.

```sh
node --import tsx --test packages/music-practice/tests/piano-parncutt-port.test.ts
# Regenerate synthetic goldens only against verified pinned upstream modules:
python3 packages/music-practice/scripts/piano-neural/chirality-port-oracle.py work/chirality/upstream work/new-parncutt-oracle.json
# Actual published coefficients remain outside source control:
npx tsx packages/music-practice/scripts/piano-neural/chirality-port-compare.ts work/chirality/requests.json work/chirality/predictions-pinned.json work/chirality/parncutt.json work/new-port-report.json
npx esbuild packages/music-practice/research/chirality/constrained.ts --bundle --platform=browser --format=esm --outfile=work/parncutt.browser.js
npm run ci -- --base origin/main
```
