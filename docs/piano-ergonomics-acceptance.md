# Contextual piano ergonomics acceptance

- Preserve physical key ownership, ties, fixed digits, held fingers, editorial
  rendering, and complete-hand diagnostics. No per-song or per-exercise rules.
- Separate practical reach from pair comfort, key depth and motion preferences.
  Support ordinary fourth-finger octaves without admitting impossible small-hand
  grips. Keep the original scoring model available for baseline replay/ablation.
- Add exact history-aware optimization: histories with different future costs
  cannot merge at the same current grip. Reset melodic history at rests, explicit
  phrase breaks and ambiguous attacks; never invent voice assignments in chords.
- Use explicit voice identity, phrase and articulation metadata where available.
  Detached key hold differs from notation duration; never infer pedal-held fingers.
- Recover only individually locatable source labels; keep doubtful digits and
  transcriber-completed references distinct from printed editorial gold labels.
  Reserve the new source's validation groups before any optimization measurement.
- Retain old-corpus comparisons, full-context reference feasibility/cost diagnostics,
  per-family coverage, and fresh-source validation without reference-digit leakage.
  Inspect preference tradeoffs; do not promote a family regression silently.
- Independently test new geometry, history, preparation/release, references and
  metric behavior. Use exhaustive small-path oracles, seeded/metamorphic witnesses,
  compiling mutations, real SVG coverage and the existing full Nightly corpus owner.
- Finish with clean committed-HEAD CI and the retained corpus report. Do not
  execute external implementations or publish without a release request.
