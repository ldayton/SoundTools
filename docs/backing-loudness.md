# Backing-track loudness

Factory mixes target approximately **−24 LUFS integrated, within 1 LU** at 100% master volume, using complete arrangements rather than a short or unusually loud excerpt. This is a conservative practice-app target, not a streaming-platform requirement. Default mixes should leave at least **1.5 dB reconstructed-peak headroom**. Loudness range is generally 3–5 LU; allow up to 7 LU so a sparse Soul arrangement can retain its musical dynamics.

## Processing

- Keep the original recordings and velocity layers. Do not peak-normalize every sample: this would flatten intentional differences in touch and raise quiet recording noise.
- Compress strong sample content once after decoding, using a stereo-linked RMS detector, a soft knee, instrument-specific attack/release, and no makeup gain. Quiet samples and recorded release tails retain their level.
- Reduce excessive planned section-level swells without changing pitches, rhythms, velocity choices, registrations or articulations. Compensate especially quiet cross-stick sections separately. Gospel already has controlled dynamics and keeps its original expression.
- Calibrate each genre and feel after its effects and compression. Fingerpicked and strummed Folk have separate profiles.
- Apply an oversampled soft safety curve with conservative output headroom after the genre trim. A native compressor's threshold is not a true-peak ceiling; measure rendered peaks independently.
- Keep the app-wide master volume last, after all dynamics, so reducing it by half reduces amplitude by half. The mixer changes instrument balance ahead of this processing. A custom mix is not automatically forced back to the factory loudness target.

The historical approved Blues/Rock reference graph is retained only for development comparisons. Current production genres use the calibrated path.

## Measurement

From the repository root, with Node 24, FFmpeg and Playwright available:

```sh
npx tsx apps/notewise/tests/audit-backing-loudness.mts --check
```

This uses the actual browser player, recordings, effects and default mixer, renders every complete C-major and C-minor factory arrangement at 48 kHz, and measures FFmpeg EBU R128 integrated/short-term loudness, loudness range and reconstructed true peak. It mutes live audio while rendering. Reports go to `work/backing-loudness/metrics.json`; no large WAVs are retained.

Check representative transpositions without repeating the full calibration:

```sh
npx tsx apps/notewise/tests/audit-backing-loudness.mts --excerpts --keys 0,4,10 --check --output work/backing-loudness-keys
```

Excerpt checks enforce peak headroom, not full-program loudness/LRA targets. Use `--styles`, `--modes`, `--qualities` and `--tempos` to narrow a diagnostic run. Recalibrate after changes to recordings, factory balances, arrangements or processing. Browser compressor implementations differ, so the graph regression also runs in Chromium, Firefox and WebKit and checks both feels, mute, master linearity and extreme-boost reconstructed peaks.

## Calibration snapshot: 19 November 2026

Complete C-major and C-minor arrangements, both feels, factory mixer, 100% master, at each genre's preferred tempo (76–104 BPM). Ranges below include all four renders per preset.

| Preset             | Integrated loudness (LUFS) | Maximum LRA (LU) | Highest true peak (dBTP) |
| ------------------ | -------------------------- | ---------------- | ------------------------ |
| Roots Rock         | -24.0 to -23.8             | 5.0              | -7.8                     |
| Shuffle Blues      | -24.1 to -23.8             | 5.9              | -5.7                     |
| Fingerpicked Folk  | -24.8 to -24.0             | 4.5              | -9.7                     |
| Strummed Folk      | -24.3 to -24.0             | 4.6              | -7.0                     |
| Country            | -24.3 to -24.0             | 4.8              | -6.1                     |
| Traditional Gospel | -24.3 to -24.0             | 4.0              | -10.0                    |
| Reggae             | -24.0 to -24.0             | 5.2              | -5.7                     |
| Pocket Funk        | -24.0 to -24.0             | 3.5              | -7.4                     |
| Mellow Soul        | -24.0 to -23.8             | 6.6              | -7.3                     |

Additional rendered checks: 108 key/quality/feel excerpts (C, E and B♭), 36 excerpts at 80/120 BPM, and 18 excerpts each in WebKit and Firefox. Every peak check passed. WebKit's integrated excerpt measurements matched Chromium at meter resolution; Firefox differed by at most 0.4 LU. The separate graph regression passed in all three engines at 44.1/48 kHz, including extreme input, mute and proportional master-volume reduction. The installed-Chrome mixer check and existing backing-track/genre suites also passed.

These are factory-mix measurements, not a promise that every arbitrary custom mix or isolated phrase will measure identically. Source recordings are unchanged. Compression happens once after decode and cached buffers are reused.

After integrating the tonic-pedal scale-practice harmony, another 36 major/minor/feel excerpts passed peak checks using `--scale-harmony`. Use that option to audit the current scale viewer's harmony; omit it to reproduce the original progression calibration above.

## Evidence

- [AES loudness normalization](https://aes.org/resources/audio-topics/loudness-project/loudness-normalization/): fixed program gains; avoid rapid automatic gain riding that produces pumping.
- [AES professional production guidance](https://aes.org/resources/audio-topics/loudness-project/audio-loudness-in-production-mastering-and-distribution-insights-from-professionals/): equal integrated loudness does not necessarily match short passages with very different dynamics.
- [EBU Tech 3343](https://tech.ebu.ch/files/live/sites/tech/files/shared/tech/tech3343.pdf): integrated, short-term and momentary metering; use complete programs and interpret short-clip LRA cautiously.
- [iZotope dynamics guidance](https://downloads.izotope.com/docs/ozone8/dynamics/index.html): choose detector and time constants for the instrument and preserve transients.
- [Web Audio specification](https://www.w3.org/TR/webaudio/#DynamicsCompressorNode): native compressor behavior and implementation latitude.
- [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html#ebur128): reproducible loudness and true-peak measurement.

## Authored scores: 20 November 2026

Scale practice now uses authored ensemble sentences in all nine presets. Their
complete-program calibration and reproducible preview commands are recorded in
[Authored backing-track sentences](authored-backing-phrases.md#calibration-snapshot-20-november-2026).
The earlier table above describes the previous arrangements, still reproducible
with the development reference arranger. Native recordings, mixer percentages
and the shared mastering graph remain unchanged.

## Approved arrangements: 24 November 2026

The new scores and user-selected instrument balances passed all 36 complete-track checks. Both feels and tonalities retain the factory target. The comparison page is a separate local review tool. [Measurements](backing-approved-calibration.json).

| Preset | LUFS | Maximum LRA | Highest true peak |
| --- | --- | --- | --- |
| rock / standard | -24.1 to -24.0 | 4.3 | -6.0 dBTP |
| blues / standard | -24.5 to -24.4 | 3.5 | -5.7 dBTP |
| folk / fingerpicked | -24.0 to -24.0 | 2.9 | -8.1 dBTP |
| folk / strummed | -24.3 to -23.7 | 4.8 | -5.9 dBTP |
| country / two-step | -24.2 to -23.8 | 4.0 | -6.2 dBTP |
| gospel / standard | -24.1 to -23.9 | 6.6 | -5.8 dBTP |
| reggae / standard | -24.2 to -24.2 | 2.7 | -6.4 dBTP |
| funk / standard | -24.0 to -24.0 | 4.1 | -8.3 dBTP |
| soul / standard | -24.1 to -24.0 | 2.4 | -9.4 dBTP |
