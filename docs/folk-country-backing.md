# Folk and Country backing

The scale's key and major/natural-minor quality remain the source of harmony.
The existing Steady / Active choice controls activity. One additional Pattern
selector appears only for Folk. Country uses Two-step without an extra selector:

| Style   | Pattern                | Playing approach                                                                          |
| ------- | ---------------------- | ----------------------------------------------------------------------------------------- |
| Folk    | Fingerpicked (default) | Alternating quarter-note thumb bass, upper-string offbeat answers and occasional pinches. |
| Folk    | Strummed               | Thumb bass on 1/3, upper-string brushes on 2/4, occasional light upstrokes.               |
| Country | Two-step (default)     | Short acoustic boom-chick, root/fifth upright and recorded brush backbeats.               |

Active Country leaves a gap for brief recorded electric-guitar double stops and
adds a diatonic bass approach at selected eight-bar boundaries. Steady keeps two
bass attacks per bar. Folk stays sparse in the quiet section. No chromatic tones
outside the selected practice scale are introduced. Native open/barre/capo
fingerings keep all strings in one playable position; a capo position is chosen
once for the entire key, not changed between chords.

`backing-acoustic.ts` provides the acoustic form and fallback performance.
Scale practice now uses the [authored sentence renderer](authored-backing-phrases.md),
with separate fingerpicked, strummed and Country scores. The existing conductor,
clock, metronome, pause/resume and loop lifecycle remain shared. Explicit sample
instrument identities prevent acoustic/electric guitars sharing round-robin
bags or choking one another. Native brush recordings bypass studio-kit
articulation substitutions. Folk uses a small room; Country is drier. Mix
changes also apply to an already-created audio context.

`backing-folk-country` adds about 11.1 MiB of 16-bit FLAC recordings. It reuses
52 existing acoustic files. Acoustic recordings cover all six physical strings
and two real velocity layers. The upstream low-string B2 gap uses A#2 raised one
semitone; other steel pitches are native. Upright source notes are mapped within
two semitones and prepared at the target pitch. Brush and electric samples use
actual recorded alternates. Nothing is downloaded until Play; key changes drop
unneeded decoded buffers. Vite includes the files in the verified offline pack.

All new recordings are CC0. Pinned revisions, original hashes and credits live
beside the manifest. Rebuild using `scripts/build-folk-country-samples.py` in a
Python environment containing numpy, scipy and soundfile; no system install,
private path, or commercial sampler is required. The previous five genres keep
their existing sound palettes and playing rules.

Local checks:

```
npm run test:notewise
npm run build --workspace=notewise
node_modules/.bin/tsx apps/notewise/tests/folk-country.browser.ts
TEST_BROWSER=firefox node_modules/.bin/tsx apps/notewise/tests/folk-country.browser.ts
TEST_BROWSER=webkit node_modules/.bin/tsx apps/notewise/tests/folk-country.browser.ts
```

The browser check uses real decoding and offline PCM rendering, checks sample
identity, clipping and decoded memory, switches patterns/keys during loading,
wraps the loop with the metronome running, verifies saved settings, and checks
MacBook Air (1680 x 1050 at DPR 2) and iPhone 14 Pro layouts (393 x 852 at DPR 3).
It saves short WAV previews and screenshots under ignored
`work/folk-country-previews/`, with live output muted throughout.
