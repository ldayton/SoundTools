# Reviewed score-layout images

Open `index.html` to inspect both browser engines on macOS and Linux. These are test-only synthetic
scores, not product songs. Each PNG is paired with its SHA-256, measured quality,
fixture settings, pinned browser version, font digest, DPR and source provenance
in the OS/browser manifest. All initial images were visually inspected before the
manifest was marked reviewed. This freezes an accepted reference, not a claim
that no further engraving improvement is possible.

Normal runs fail on missing, unreviewed, damaged or incompatible baselines.
They never write here. Pixel comparisons ignore ink-edge differences within one
pixel, but fail on larger changes relative to the amount of ink (0.1%, minimum
2 pixels), or image-size changes exceeding one pixel. Musical and geometric
properties remain independent checks. Fonts and browser versions are pinned;
platforms may render antialiasing differently. Failures must be investigated,
not automatically retried or re-recorded.

Generate candidates explicitly, one engine at a time:

```
npm run test:score-layout --workspace=songalong -- --record-candidates
TEST_BROWSER=webkit npm run test:score-layout --workspace=songalong -- --record-candidates
```

Each command prints its retained `work/browser-results` directory. This is
candidate generation, not a test pass or approval. Inspect every PNG and the HTML
report. For intentional changes only, manually copy the reviewed PNGs and their
manifest into the corresponding OS/browser folder, set `reviewed: true`, and record
the reviewer/date/reason. Keep the PNG hashes and provenance together. CI rejects
candidate generation; it cannot bless its own changes.

Run comparisons through `npm run test:score-layout --workspace=songalong` or the
registered Nightly command. Failures retain actual/reference PNGs, highlighted
differences, before/after crops, measurements, browser traces and an HTML gallery.
