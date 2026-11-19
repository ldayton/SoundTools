# Traditional Gospel

The guitar scale viewer's Traditional Gospel backing uses a rolling, four-beat
triplet pulse, a sustained Hammond-style tonewheel organ, acoustic piano,
electric bass, drums and occasional tambourine. It supports all twelve keys in
major and natural minor. No chromatic passing tones or automatic modulations
are introduced into scale practice.

Major harmony includes sixth chords, inversions, ii–V–I movement and a closing
IV–I cadence. Natural minor uses its own compatible sevenths, inversions and
half-diminished ii chord. Organ voicings are chosen across the full progression;
common notes remain held across chord changes. Piano supplies shorter attacks
and phrase-end answers. Steady keeps two bass attacks per bar; Active adds
selected diatonic approaches, piano answers and tambourine during the lift.

The original tonewheel model has nine drawbar footages, two smoothly blended
registrations, upper foldback, gentle saturation and scanner-style chorus. A
shared stereo rotary effect has separate high/low rotors, Doppler delay,
amplitude movement and different acceleration/deceleration rates. Expression,
registration and rotary speed follow the phrase/section, including while notes
are held. Steady uses the slow rotor; Active opens up during the stronger
sections. This is an emulation, not a recording of a physical Hammond organ.
There is no organ sample download, sample-loop seam or additional dependency.

Sampled piano reuses the bitKlavier Grand recordings already licensed by the
apps under CC BY 4.0, with native roots at most one semitone away. The compact
prepared bank adds about 1.75 MiB. Original credits, adaptations and hashes are
in `src/assets/backing-gospel/`; `scripts/build-gospel-piano.py` rebuilds it from
the existing repository files without downloads or personal filesystem paths.
Drums, tambourine and electric bass reuse the existing CC0 recordings. Only
the kit pieces needed by Gospel are loaded. Everything is included in the
verified offline inventory. Settings links to the recording/model credits.

The shared transport owns the model, including pause, tempo/seek restoration,
palette changes, key reload cancellation, visibility changes, loops and teardown.
Organ and piano cannot choke one another. Scheduled organ notes and expression
automation are canceled together; leaving the style disposes its rotary graph.
Backing playback now follows the existing application volume control, with the
same default gain at 100 percent for previously approved styles.

Verification:

```
npm run test:notewise
npm run build --workspace=notewise
node_modules/.bin/tsx apps/notewise/tests/gospel.browser.ts
TEST_BROWSER=firefox node_modules/.bin/tsx apps/notewise/tests/gospel.browser.ts
TEST_BROWSER=webkit node_modules/.bin/tsx apps/notewise/tests/gospel.browser.ts
GOSPEL_FULL_PREVIEWS=1 node_modules/.bin/tsx apps/notewise/tests/gospel.browser.ts
```

Tests check every key/quality, live volume, sustained-note energy, timbral
development, stereo rotation, silence after stop, exact native sample selection,
loop/key/tempo transitions, stale palette cancellation, saved settings, actual
rendered PCM and layouts for MacBook Air 13-inch and iPhone 14 Pro. Live output
is muted. Full previews cover bars 17–32 at 76 BPM, including the transition
from the settled section to the lift; shorter browser checks cover four bars.

Design references:

- [Berklee gospel keyboard curriculum](https://online.berklee.edu/courses/gospel-music-for-keyboard)
- [Braxton D. Shelley, Hammond timbre in Black Pentecostal performance](https://journals.sagepub.com/doi/10.1177/20592043241302531)
- [Hammond/Leslie rotor controls](https://hammondorganco.com/wp-content/uploads/2011/03/Leslie2101manual.pdf)
