# Soul and Folk exploration

Soul and Folk are approved and integrated alongside Blues, Rock, Country,
Reggae and Funk. The backing widget uses a single native genre dropdown sourced
from the central registry, with the practice bar's standard text sizes. Feel,
tempo, inherited key, play/pause and metronome interaction remain unchanged.

The feature branch includes the approved Country framework and sustained
Reggae/Funk versions. The separate acoustic-space experiment is not included.

## Music and instruments

Soul: 84 BPM previews, laid-back backbeat, sparse fingered electric bass, and warm
electric-piano seventh chords. Major uses Imaj7–vi7–ii7–V7; natural minor uses
i7–VImaj7–iv7–v7. All chord tones stay in the selected parent scale. Quiet keyboard
voicings sustain nearly two bars, with natural decay and a soft release, avoiding
a lead line. No guitar is layered over the electric-piano palette.

Folk: 88 BPM previews, genuine steel-string acoustic guitar, sparse electric bass,
soft cross-stick and a gentle hat/shaker pulse. Soft full chord brushes ring for
most of a bar; Active adds occasional quiet supporting brushes, not melody.
Acoustic samples are selected by physical string and pitch, with same-string
choking and natural release. Existing electric-guitar note-off noises are omitted.
This first palette retains the approved electric bass and uses cross-stick rather
than claiming brush or upright-bass recordings.

Both have 64-bar Opening/Pocket-or-Settled/First lift/Breathe/Return/Home forms,
loop-seam energy matching, phrase/cycle variation and at most two bass attacks
per bar. Breathe omits four second attacks, giving 124 bass attacks per story.
The approved shared pocket and drum articulation layers remain active.

## Open sound banks

Folk uses 52 soft picked Meta Steel Guitar recordings on D/G/B/High-E strings,
frets 0–12. Source: Meta Platforms Inc., CC0 1.0, from Meta Open Sound. Natural
recordings last several seconds; packaged soft samples retain up to eight seconds.
They are resampled to 24 kHz, gently faded at the end and panned like the existing
support guitar. Source OGG hashes are retained in the bank audit.

Soul uses FluidR3 GM electric piano 1, Frank Wen, MIT. The font and an existing
FluidSynth executable were already installed. The builder renders isolated native
notes at two velocities with chorus/reverb disabled, then prepares six-second
24 kHz samples with gentle HP/LP filtering. A constant asset calibration gain
brings the soft patch into the quiet harmonic-support role. Full MIT text and the
source font SHA-256 are included. No software was installed; sfizz is not used.

The additional bank is approximately 10 MiB compressed. Credits and full license
text are linked from app Settings. No proprietary or restricted-redistribution
sample pack is involved.

## Playback architecture

Genre definitions select distinct sound presets, separate from harmonic/rhythm
strategy and mixer settings. The shared sampler now supports a polyphonic `keys`
part and physical-string acoustic sample selection. Keyboard release uses its own
soft envelope rather than guitar release recordings. Keys use the approved quiet
harmonic-support bus gain, with a restrained room send. Existing instrument bus
gains, compressors, panning and room stay fixed.

Changing between sound presets reloads the native-key working set, cancels stale
loads and keeps an enabled metronome clock active, like a key change. Sample memory
remains below 256 MiB in checked cases (roughly 235–239 MiB). Existing presets keep
the previous path and sample pool.

## Checks

189 unit tests pass. All 224 Blues/Rock and 112 Country frozen full-take fingerprints
still match exactly. Another 48 full sustained Reggae/Funk fingerprints match the
preferred source worktree, preserving those styles as well. The previous 48 rhythm
fingerprints also remain valid. Soul/Folk are checked in every key, both modes and
qualities for diatonic harmony, supported sample pitches/strings, sparse bass,
loop bounds and sustained chord lengths.

Build and TypeScript pass. Live browser checks cover both new UI selections,
keyboard/acoustic palettes, native-key decoding, preset/key reload races,
metronome continuity, bounded memory and mobile horizontal overflow. The approved
Blues/Rock browser regression also passes.

## Reproduce

- `python scripts/build-soul-folk-samples.py` using the existing audio Python env
- `npm test --workspace=@ldayton/music-practice`
- `npm run build --workspace=notewise`
- `node_modules/.bin/tsc -p apps/notewise/tsconfig.json`
- `node_modules/.bin/tsx apps/notewise/tests/soul-folk.browser.ts`
- `node_modules/.bin/tsx scripts/render-soul-folk-previews.mts OUTPUT`
- `python scripts/match-backing-ab.py OUTPUT`

Eight complete 64-bar WAVs: both styles, A major/minor, Steady/Active. Stereo
48 kHz/24-bit, with two seconds of release after the story. App loops exclude that
preview tail. Constant-gain loudness matching across the set preserves phrase
dynamics, without limiting or rolling normalization.

## Dropdown adoption

Browser checks cover all seven dropdown options and saved selection, inherited
exercise key, playback, metronome behaviour and sound-preset reloads. Backing
controls run in the cross-browser CI lane; detailed instrument/palette checks
run in its Chromium lane.
