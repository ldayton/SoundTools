# Shared score layout

`packages/music-practice/src/score-layout` is the shared score-layout component.
It is independent of song identities and application settings storage.

## Boundaries

- `plan.ts`: pure, deterministic geometry contract. `planScoreLayout` receives
  measured sections/bars and available engraving width, returning half-open bar
  ranges, explicit break arrays, minimum/natural widths and unresolved overflow.
  Required boundaries, opening repeats, pickups, ending fragments and phrase-end
  preferences are musical constraints. Never branch on a song ID here.
- `abc.ts`: the abcjs adapter. `prepareScoreLayoutSource` owns display-only ABC
  spacing directives. `AbcScoreLayout` owns measurement, renderer parameters,
  break planning, SVG framing and responsive wrapper dimensions. It supports
  reflowed scores, compact wrapped prompts and time-based rhythm exercises.
- `svg.ts`: owns SVG framing rules for the declared visible layers, including
  lyrics, tab-only and chords-only presentation. No song identities enter here.
- `practice-score.ts`: prepares musical visibility/lyrics and invokes the
  component. Instrument adapters add fingerings, tab rhythm, chord diagrams and
  melismas; layout framing runs after those additions. Playback remains derived
  from musical content, not the layout plan.
- The application shell supplies the actual container width. Its side-panel
  allocation policy is separate; this extraction does not fix that audited issue.

## Measurement and fitting

Reflow uses two hidden engraving passes with identical visible staves, lyrics,
chords, tablature and preparation callbacks: natural spacing and compressed
collision-constrained spacing. The shared policy adds safety/annotation room and
expresses preferred expansion through the flexible difference between those
widths. Fixed system-start overhead is reserved separately. abcjs still owns
within-system note alignment; this component does not replace its engraver.

Measurements are cached independently of viewport width in a bounded 32-entry
cache keyed by source, renderer parameters and semantic preparation context. A
callback without an explicit measurement context disables caching, preventing
unkeyed callback dependencies from reusing stale measurements.

The planner balances density across systems and permits short final systems.
It does not mutate notes, durations, lyric underlay or source checkpoints. An
indivisible bar may be wider than the container: the plan reports that overflow.
Final reflowed SVGs retain their requested physical scale and scroll locally;
they are not silently made smaller. Wrapped compact prompts explicitly retain
fit-to-box behavior. Hidden ink and rectangular clipped-away source staves are excluded from final
ink bounds. Those bounds are included before sizing both the SVG
and abcjs's wrapper; stale aspect-ratio padding must not clip or add empty space.

The current adapter reserves each section's measured start overhead on every
system. This is conservative: more precise continuation-signature measurement
and a post-engraving replan are future refinements. Overflow is reported and
contained, not claimed to be impossible. Vertical collision-aware placement
remains with abcjs and instrument/lyric geometry adapters.

## Regression owners

- `packages/music-practice/tests/score-system-plan.test.ts`: content-sensitive
  packing, fixed overhead, mandatory boundaries, pickups/repeats/short endings,
  lossless coverage of bars, deterministic plans, explicit impossible fits and
  physical scale preservation. Automatically included in shared CI music units.
- `packages/music-practice/browser-tests/score-layout.ts`, called by the existing
  required SongAlong instrument-toolbar browser owner: independent piano,
  guitar-tab, pointed-Hebrew and dense-bar fixtures exercise the component directly
  without app state or a named product song. Checks real engraving, cache reuse,
  unchanged sound, width-dependent breaks and local overflow at unchanged scale.
- Existing guitar registry and edition witnesses retain musical, fingering,
  lyric, tab and presentation assertions. The old `beginnerSystems` source-splitting
  helper and its redundant audio comparison are retired; shared planner coverage,
  the component audio witness and edition timing tests now own that behavior.

No new test tier, server port or exhaustive CI catalog loop is added.

## Layout evaluation

The same independent fixture registry now drives property checks and a reviewed
visual corpus. The small property witnesses stay inside the required CI component
owner: verse-order invariance (within 0.05 engraving units, less than 0.1 CSS pixel,
with exact system-break equality), cold/cache agreement, resize round trips at nearby
widths, actual physical scale, source musical signatures and injected-wrapper
whitespace detection. They do not depend on a named product song.

`score-layout-quality.ts` evaluates observed browser geometry independently of
planner cost. For these small fixtures, outer blank bands are limited to three
staff spaces, system height to fifty, unexplained total scroll overhead to three,
and horizontal overflow to subpixel rounding. Adjacent lyrics require a quarter
staff space of separation. Large note gaps are reported both raw and normalized
by the square root of the source duration relative to a quarter note; the latter
has a twenty-staff-space budget. This permits the legitimate extra space of long
notes without treating every bar as equally dense. These are acceptance limits
for the synthetic corpus, not universal engraving standards or production knobs.
Unit tests independently inject each defect, and browser tests inject extra
wrapper padding to ensure the measured scroll-overhead check detects it.

Nightly additionally runs `tests/score-layout.browser.ts` in Chromium and WebKit.
It compares seven fixture images against explicitly reviewed OS/browser-specific
baselines. The test-only font is bundled and checked by SHA-256; browser version,
DPR and platform must match the manifest. Musical and geometric properties are
shared across platforms. Visual comparison is based on actual raster pixels,
with a one-pixel ink-edge allowance and a strict ink-relative difference limit.
Independent sample images prove detection of moved/removed ink and added blank
height; an antialias-sized edge displacement is accepted deliberately.

Every run retains actual images, metrics, provenance and an HTML gallery; changes
also produce reference images, highlighted differences and before/after crops.
Candidate generation is an explicit manual command and cannot run in CI. Normal
comparisons never update approved references. Review instructions and the gallery
are in `packages/music-practice/test-fixtures/score-layout-baselines/README.md`.

Initial evaluation exposed excess top whitespace and missing standalone lyric
padding. Both were corrected in the central adapter. Lyric separation now uses
measurement-only thin spaces, stripped from display text after engraving, so it
reserves readable word gaps without the previous excessive en-space allowance.
The clip regression fixture positions its clipping rectangle relative to each
system's own viewBox origin; absolute coordinates across different systems would
create genuinely visible ink above the intended system and test the wrong case.

Shared CI also checks that all twenty-eight reviewed PNGs and their manifests
are present and match their approved hashes, even when the current host runs
only one OS/browser variant. Linux references were generated with the pinned
Playwright downloads, not the differently patched browser preinstalled in the
container image. Pixel capture uses the component directly and therefore has no
stale app-build dependency; the bundle fingerprint is recorded in provenance.
