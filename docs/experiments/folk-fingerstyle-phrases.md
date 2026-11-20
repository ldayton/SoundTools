# Fingerstyle Folk: authored phrase audition

The initial A/B compared the previous tonic-pedal Folk arrangement (A) with the
AI-assisted authored alternative (B). B is now integrated in the local scale viewer;
`referenceGenreBackingArrangement` retains A for reproducible comparisons.
Both use the existing steel-string recordings, upright bass, recorded brushes,
room, dynamics and mixer at 88 BPM. There is no runtime model or API.

The new score keeps quarter-note root/fifth thumb bass independent of the fingers.
Four eight-bar sentences (two Steady, two Active) use recurring upper-voice motifs,
selective pinches and short pentatonic answers. Upright and brush activity reduces
at guitar answers instead of adding simultaneous fills. Minor turns use the
pentatonic fourth; major turns use the second. Pitches are assigned to reachable
strings around a single open/capo position, with gates before a string's next
attack. This is deliberately accompaniment over a tonic, not a solo guitar piece.

Content: `packages/music-practice/src/backing-phrases/folk-fingerstyle.json`.
Audition adapter: `backing-folk-phrases.ts`. The adapter now feeds the production performance pipeline as well as the
rendering tool and its unit tests. It leaves its input untouched. Changing key or
tempo does not reshuffle the phrase order. Do not promote it merely because its
mechanical checks pass; listen to the A/B comparison first.

From the repository root:

```sh
npx tsx apps/notewise/tests/audit-backing-loudness.mts --folk-fingerstyle-ab --qualities major --keys 0 --check --output work/folk-fingerstyle-ab/raw-major
npx tsx apps/notewise/tests/audit-backing-loudness.mts --folk-fingerstyle-ab --qualities minor --keys 9 --check --output work/folk-fingerstyle-ab/raw-minor
```

Each export is sixteen bars from the same settled section (bars 9–24), plus a
short tail: 44.14 seconds at 88 BPM. Both Steady and Active are rendered. These
use the actual browser player and its decoded recordings, with live output muted.
The tool checks finite PCM, non-silence and reconstructed peak headroom.

For fair listening, copy the eight WAVs into a separate previews directory and run:

```sh
python3 scripts/normalize-backing-previews.py work/folk-fingerstyle-ab/previews --target-lufs -24
```

This uses constant gain to match the excerpts to −24 LUFS. The existing preview
normalizer also fades the final 250 ms and has a safety limiter; peaks in these
comparisons remain far below its threshold. Raw renders and before/after loudness
measurements remain available for inspection under ignored `work/`.

Unit checks cover all twelve keys, all six scale types, both feels and 50/88/180
BPM. They verify diatonic pitches, available instrument/string samples, reachable
sounding frets, independent alternating-thumb motion, non-overlapping string/bass
gates, loop boundaries, deterministic phrase selection and input immutability.
