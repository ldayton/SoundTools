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

Reflow measures compressed collision width and natural rhythmic width separately.
The natural probe is unconstrained and isolates each section: abcjs otherwise
compresses an over-wide last line even with `stretchlast=0`, and justifies earlier
sections to the supplied width. A cached opening probe breaks after each sounding
bar and applies the same preparation callback, capturing actual continuation
headers, changed signatures, multiple staves and tablature without guessing glyph
widths. Each bar records its already-included leading inset; a new header replaces
that inset instead of counting the same clearance twice. `startWidths` records the overhead at each possible system start.

Collision clearance is a fixed four engraving units per sounding bar, rather
than a percentage of every symbol and word. The natural target uses the renderer's
actual natural spacing, without an additional blanket expansion multiplier.
abcjs continues to own within-system note alignment and local text clearances;
this component does not replace its engraver. Short-lyric tests compare comfortable
spacing, permitting a staff space of word/barline clearance; a no-lyrics collision
minimum is not enough room for readable lyric text.

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

Final engraved staff extents can impose additional contextual minimum widths.
Those constraints apply to the exact candidate bar range, rather than inflating
all section headers. Each rejected multi-bar range is excluded from subsequent
plans, bounding refinement by the number of possible multi-bar ranges. Private
copies protect cached measurements. Pickup attachment checks also consult these
constraints, so an impossible pair is allowed to split without losing music.

The pure planner penalizes compression relative to the available flexibility and
abrupt changes in density between adjacent justified systems. Naturally short
final systems do not force their predecessors to match fictitious stretching.
An exhaustive partition oracle checks global optimality on small synthetic inputs.

The shared minimum inter-staff separation is 24 ABC points (32 engraving units).
This reduces blank padding; abcjs still expands around engraved notes and lyrics,
and explicit source spacing remains authoritative. This is a conservative native
spacing improvement, not a replacement skyline placement engine. Full contour-
based inter-staff positioning and a new within-measure text solver remain separate
future work; no SVG coordinates or musical timing are rewritten to simulate them.

`AbcScoreLayout.diagnostics` returns private-copy measurements, contextual range
constraints and render-pass count. Visual failure reports retain this semantic
geometry alongside images, making opening-width and replan regressions inspectable.

## Regression owners

- `packages/music-practice/tests/score-system-plan.test.ts`: content-sensitive
  packing, fixed overhead, mandatory boundaries, pickups/repeats/short endings,
  lossless coverage of bars, deterministic plans, explicit impossible fits and
  physical scale preservation. Automatically included in shared CI music units.
- `packages/music-practice/browser-tests/score-layout.ts`, called by the dedicated
  required SongAlong `score-layout-contract.browser.ts` owner: independent piano,
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

The adapter verifies final engraved staff extents before presentation.
abcjs can introduce system-end spacing after the compressed probe. When a
multi-bar system genuinely exceeds the available width, its measured minimum
adds an exact-range minimum and the planner runs again. Refinement is
bounded by the number of candidate multi-bar ranges, uses private copies of cached measurements and retains
physical scale. It reads each staff's geometry, not abcjs's repeated maximum
viewBox. Indivisible bars continue to report overflow instead of being shrunk.

## Printed score headers

Print and PDF use the same header in `score-export.ts`: a centered serif title,
words and translation credits on the left, and musical credits on the right.
Mobile paper stacks credits left-aligned; this follows the chosen PDF paper,
independently of the browser viewport. Supplementary credit sentences and quoted
tune attributions receive separate, quieter lines. Composer-name casing is
preserved. The shared export browser witness checks actual header ink bounds,
alignment, title separation and mobile wrapping with independent credit fixtures.
Desktop Print uses the shared printer icon; mobile Save PDF remains text-only.


## Source-guided regression expansion (26 November 2026)

The component owner now includes header changes, separated sections, sparse upper
voices against moving lower voices, short/long lyrics and pointed-Hebrew melismas.
Observed rhythmic columns use the union of attacks from every visible voice,
rather than only the first voice. Synthetic acceptance checks detect less than
one staff space between distinct columns, more than 0.15 staff space of simultaneous
anchor misalignment, and cross-staff ink overlap at shared horizontal positions.
DOM mutations prove that a displaced lower voice and an intruding staff note are
actually detected. Audio signatures remain invariant through reflow and lyric changes.

Inline key/clef changes update the signature policy's effective end-of-system
state, preventing the same change from being printed again at the next opening.
Restoration of musical signatures remains required before audio generation.

The reviewed synthetic comparison against `c9330609` showed a header-heavy phone
example falling from six systems to four, pointed Hebrew from eight to seven, and
a desktop piano example about 6% shorter at unchanged physical scale. These are
fixture measurements, not a promised reduction for every score. Accounting for the leading inset also reduced the phone guitar example from
eight systems to seven (about 12% less height); its desktop geometry stayed unchanged. No image tolerance was loosened.

Reflow also normalizes abcjs's wrapped bar-number offset for empty opening
repeats. The parser counts nonempty measures, while its wrapping stage counts
all bar tokens; the adapter removes only that empty-bar offset. Synthetic and
edition checks retain the correct final measure number across break changes.
The TAB adapter coalesces identical position marks and fermatas from simultaneous
notation voices at the same horizontal anchor, so a reflow cannot duplicate a
shared symbol. Distinct symbols and positions are retained.
