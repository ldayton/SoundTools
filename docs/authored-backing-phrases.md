# Authored backing-track sentences

All nine factory presets use coordinated authored content in scale practice.
AI assists offline score writing; the app uses reviewed static data and the
existing player. There is no runtime model, API request or additional setting.
The original arrangers remain fallback implementations and development references.

| Preset             | Musical sentence                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Shuffle Blues      | Twelve-bar repeated fifth/sixth riff (minor seventh in minor), sparse bass links, upper-register lead answers, a designated drum turnaround. |
| Roots Rock         | Muted power-chord pulses open into ringing lift accents. Bass pickups and open-guitar replies occupy separate windows.                       |
| Country            | Short acoustic boom-chick, root/fifth upright and clean electric double stops. The rhythm guitar leaves room for the reply.                  |
| Fingerpicked Folk  | Independent alternating thumb with recurring upper melodic questions/answers, selective pinches, reduced bass/brush support at replies.      |
| Strummed Folk      | Broad ringing bass-and-brush gestures, light upstrokes and simple cadences, without Country's electric twang or short two-step gates.        |
| Traditional Gospel | Hammond-led triad/sixth/ninth or minor-seventh/suspended colours; piano punctuation, separate bass/organ answers and restrained fills.       |
| Reggae             | Repeated two-bar bass hook, high-to-low offbeat skanks and a restrained organ bubble. Bass and organ take different reply windows.           |
| Pocket Funk        | A recognizable syncopated bass hook, ghosted pickups, clipped chord accents and quiet scratches. The guitar and bass alternate replies.      |
| Mellow Soul        | Sustained rootless sixth/minor-seventh keyboard calls, short keyboard answers, clean guitar responses and deliberate space.                  |

There are two sentences per feel. Blues sentences have twelve bars; other styles
have eight. Gospel has distinct major/minor scores; the other scores spell their
relative voices for the selected quality. The common pentatonic vocabulary also
fits the full major/minor and blues exercises. Tonal harmony stays on the selected
practice tonic, retaining the app's scale-practice behavior. This is accompaniment
for a learner, not a transcription or a demonstration of each genre's full harmony.

## Shared realization

`backing-phrases/ensemble.json` defines seven presets' genre briefs, instruments,
voicings, explicit rhythmic cells and bar-by-bar ensemble choices. Each bar also
names an optional answer owner and a reply window. `backing-ensemble-phrases.ts`
validates the data and realizes it using native recordings and reachable guitar
positions. The approved Gospel and fingerstyle score adapters retain their own
content contracts. Every adapter feeds the same drum-articulation, ensemble timing,
section-leveling, mixer and master-output pipeline in `backing-genre-engine.ts`.

The existing genre drummer and dynamic form are retained. Unassigned drum fills
are removed; only designated drum endings can add a small turn. At a reply, other
pitched parts finish before the answer window. Guitar gates respect strings and
physical instrument identity, so acoustic accompaniment does not choke a second
electric player. Funk scratches and chord strokes belong to the same player.
Country uses its established capo/open shapes; electric parts use playable triads.
Soul's keyboard calls leave the tonic to bass. Reggae keeps its one-drop foundation.

Sentence selection depends on musical position and loop count. It is stable under
key/tempo edits, pause/resume and rendering speed, and alternates across loop seams.
No new controls, persistence keys, audio assets or cloud dependencies are added.
Mixer percentages remain relative to the factory arrangement, with master volume
last. Fixed measured score gains retain dynamics and relative part balances.

Malformed scores or unsuitable contexts retain the established arranger; unit tests
require the shipped libraries to validate. `referenceGenreBackingArrangement`
reproduces the previous factory performance for A/B tools. Generic progression
calls that omit scale-practice quality retain their prior performance as well.

## Validation and reproducibility

```sh
npm test --workspace=notewise
npm run build --workspace=notewise
npx tsx apps/notewise/tests/authored-backing.browser.ts
TEST_BROWSER=firefox npx tsx apps/notewise/tests/authored-backing.browser.ts
TEST_BROWSER=webkit npx tsx apps/notewise/tests/authored-backing.browser.ts
npx tsx apps/notewise/tests/audit-backing-loudness.mts --scale-harmony --check --output work/authored-backing-full
npx tsx apps/notewise/tests/audit-backing-loudness.mts --save-excerpts --check --output work/authored-backing-previews
npx tsx apps/notewise/tests/audit-backing-loudness.mts --save-excerpts --reference-arranger --check --output work/original-arranger/previews
```

The audit renders the actual player and recordings through the production graph
at 48 kHz, measures FFmpeg EBU R128 loudness/true peak and keeps reports under
ignored `work/`. `--save-excerpts` saves one complete representative sentence per
preset/quality/feel as a 16-bit stereo WAV; it does not normalize the excerpts
independently. Complete-program calibration targets −24 LUFS within 1 LU, LRA no
more than 7 LU, and true peak at or below −1.5 dBTP. Use full programs for calibration,
not isolated stems or the loudest phrase. Live output is muted during testing.

Unit checks exercise all twelve keys, both feels and 50/90/180 BPM for every preset,
plus all six scale types at representative transpositions. They check native
instrument pitches, physical voice overlaps, bounds, tonic bass, deterministic
phrase order, rejected revisions and unchanged inputs. Target-device browser
checks cover real playback, feel/style/pattern changes, transposition, pause/resume
and reload without autoplay at MacBook Air and iPhone 14 Pro dimensions. Existing
mixer, metronome and master-output regressions cover shared audio behavior.

## Calibration snapshot: 20 November 2026

Complete C-major/C-minor factory arrangements, both feels, preferred genre tempo,
48 kHz, 100% master and default mixer. Gospel retains the already measured score.

| Preset             | Integrated loudness (LUFS) | Maximum LRA (LU) | Highest true peak (dBTP) |
| ------------------ | -------------------------- | ---------------- | ------------------------ |
| Roots Rock         | -24.0 to -24.0             | 4.1              | -7.9                     |
| Shuffle Blues      | -24.0 to -23.9             | 4.9              | -5.7                     |
| Fingerpicked Folk  | -24.0 to -24.0             | 4.0              | -8.8                     |
| Strummed Folk      | -24.0 to -24.0             | 5.6              | -5.7                     |
| Reggae             | -24.0 to -24.0             | 4.3              | -5.7                     |
| Pocket Funk        | -24.0 to -24.0             | 3.5              | -7.8                     |
| Country            | -24.0 to -24.0             | 3.9              | -6.0                     |
| Mellow Soul        | -24.1 to -24.0             | 3.1              | -9.0                     |
| Traditional Gospel | -24.1 to -23.9             | 5.2              | -10.4                    |

The 36 representative sentence WAVs also passed reconstructed peak checks and
mono-fold checks. Excerpts retain their natural phrase/section dynamics and are
not individually forced to the full-program loudness target. Original recordings
are unchanged. Technical checks establish safety and consistency, not subjective
musical quality.

## Harmonic review

The subsequent [composition review](backing-composition-review.md) keeps tonic
vamps and improves register, common-tone legato, suspension resolution and actual
melodic contours. Its revised-program measurements supersede the affected rows
in the initial calibration snapshot above.
