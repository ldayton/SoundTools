# Soundglow pitch: implementation and practice pilot

2026-10-20. Local implementation; no commit or push requested.

## Implemented

Pitch has two built-in presets, Soundglow and Praat. Spectrogram presets are
unchanged. Old pitch `voice` selections migrate to Soundglow. Named custom pitch
presets remain intact. Historical comparison scripts retain a separate frozen
legacy drawing configuration, not an extra selectable preset.

Both presets use the same Praat raw-autocorrelation pitch detector. Soundglow adds:

- Speech evidence from WebRTC/libfvad's gentlest mode, in the existing worker.
  Ten-millisecond decisions support a pitch frame if speech is detected within
  100 ms before or 30 ms after its timestamp. This is evidence about speech, not
  calibrated pitch correctness or speaker identity.
- Confirmation of an upward change of at least 1,800 cents from recent accepted
  pitch: six consistent 10 ms observations are needed for the 50 ms option.
  Ordinary brief voicing, downward changes and unanchored onsets are not subject
  to that rise rule. A genuine brief large rise can still be suppressed.
- Maximum gap connection of 200 ms, reduced from the legacy 800 ms.
- Complete 100 ms groups before plotting, rather than revising partial groups.

Speech filtering and 0/30/50 ms rise confirmation are editable under Advanced
trace and are saved with presets. Praat defaults to both off. No preset-name
branches select processing; settings determine behaviour. Existing grouping,
rounding and off/light smoothing remain available. No additional adaptive
smoothing or candidate-aware sequence tracker was introduced in this pass.

The speech WASM is 15 KB, lazy-loaded within the persistent worker. Its hash,
version and third-party notices are vendored. Native 8/16/32/48 kHz input is
handled directly; other rates use a timestamp-preserving, anti-aliased 16 kHz
resampler. The worker resets speech state at capture discontinuities or session
changes. The original microphone/AudioWorklet/transport is not restarted when
settings change. Speech evidence is retained to allow immediate filter changes.

Fifty milliseconds is a decision-lookahead setting, not total microphone-to-screen
latency. Capture packets, analysis context, grouping context and playout contribute
separately. The pitch display uses an explicit additional 50 ms clock allowance
with that setting. Speech-detector processing time is included in developer
performance measurements. Physical input-to-display latency has not been measured.

## Audio selected

| Material | Selection and purpose | Limit |
| --- | --- | --- |
| PTDB-TUG | 16 complete utterances, eight speakers, microphone plus laryngograph/reference files; two shared sentences per speaker | Clean read headset speech, not spontaneous or phone audio |
| AVID | 16 soft/normal sentence and paragraph recordings, four speakers | Retention and listening checks; no reference pitch labels extracted for these clips |
| Existing AMI/interview | Four natural conversational headset excerpts and the eight-second English interview regression | AMI channels are from one meeting; known examples are not held-out evidence |
| Controlled noise | 32 secondary PTDB versions, changing distinct rain/vacuum/typing excerpts at 20/10 dB whole-excerpt RMS SNR, with two-second speech-free bookends | Synthetic; no claim that these reproduce real phones |
| Noise only | Three original ESC-50 environmental recordings | Explicit negative tests, including failures |

There are 72 cases, not 72 independent speakers. Original and mixed versions of
one speaker stay in the same split. Development PTDB speakers: F01/F02/M01/M02;
evaluation: F03/F04/M03/M04. AVID development: speaker 1 (female), 2 (male);
evaluation: 3 (male), 9 (female), using supplied metadata. The provisional first
four IDs were revised for balanced coverage before examining speaker 9 pitch;
thresholds were not retuned on that speaker.

Sources:

- [PTDB-TUG, TU Graz](https://www.spsc.tugraz.at/databases-and-tools/ptdb-tug-pitch-tracking-database-from-graz-university-of-technology.html),
  Pirker et al. 2011; ODbL/Database Contents License.
- [AVID](https://zenodo.org/records/10524873), Alku et al. 2024;
  CC BY 4.0. Only selected ZIP members are retrieved with bounded HTTP ranges.
  The selected files are actually 44.1 kHz floating-point WAVs; preparation reads
  the files rather than assuming the rate described in the README.
- [AMI](https://groups.inf.ed.ac.uk/ami/download/), AMI Consortium; CC BY 4.0.
- ESC-50 noises are CC BY-NC 3.0 and remain local research material.

Original files, source URLs, selected archive members, licences and derived PCM
hashes are pinned in source manifests. No speech gain normalization or looping
is applied. Mixtures reject newly clipped speech/noise sums. Noise-only sources
retain their existing full-scale samples. Players use IEEE float32 WAV containers
with the exact analysis PCM samples: no lossy listening copy or hidden gain change.
Chrome playback was verified. The application example itself is unchanged.

## Findings and qualifications

At the fixed zero-offset reference convention, excluding 30 ms around reference
voicing transitions and using equal final intervals:

| PTDB cases | False pitch in reference-unvoiced frames: legacy → Soundglow | Missed reference-voiced frames: legacy → Soundglow |
| --- | --- | --- |
| Development, originals | 328 → 101 | 24 → 24 |
| Evaluation, originals | 501 → 100 | 16 → 16 |
| Synthetic noise, 20 dB | 2,748 → 1,242 | 38 → 38 |
| Synthetic noise, 10 dB | 3,114 → 1,878 | 42 → 43 |

The additional rejected reference-voiced observation in the 10 dB condition was
M03-sa2 at 5.39 s: the original estimate was 1,042 Hz versus a 72 Hz reference.
Thus this particular rejection removed a grossly incorrect pitch, not a correct
estimate. This does not establish universal preservation of real speech.

Reference hop is documented as 10 ms; the exact first-centre convention is not
established. Results also retain fixed 16/32 ms offset sensitivity scores.
Reference measurements come from processed laryngograph signals, not infallible
manual labels. These are pilot comparisons, not definitive accuracy percentages.

Connections crossing at least 100 ms of reference-unvoiced material decrease
from 99 to 34 in development and 113 to 32 in evaluation. No new connection break
inside a wholly reference-voiced interval was counted in this pilot. These
assumption-dependent drawing metrics do not establish perceptual superiority.

**Known failure:** the three standalone noise cases retain all 617 previously
accepted pitch observations. The lightweight speech detector is not a complete
noise classifier. Do not present this pass as solving noise rejection. Very brief
large real rises, breathy/creaky production, humming/singing, other languages,
background speakers, real phone processing, and thermal/battery behaviour remain
important gaps. The corpus does not yet contain actual user practice recordings
or justify claims about training outcomes. A stronger classifier should be
compared against these negatives before replacing the lightweight gate.

## Reproduce

Preparation is optional research setup, separate from ordinary CI. Requires
FFmpeg, Python, and NumPy/SciPy for the retained AMI preparation:

```sh
python3 tests/pitch-comparison/prepare-practice.py
python3 tests/pitch-comparison/prepare-avid.py
python3 tests/pitch-comparison/prepare-near-mic.py
node tests/pitch-comparison/prepare-practice-noise.cjs
npm run test:pitch-practice
```

The prior eight-second interview control must already be prepared by the audited
pitch-comparison workflow. Missing inputs fail explicitly. The existing research
Python environment is `/tmp/soundglow-vad-research/bin/python` on this machine.

Comparison runs through the shipped processor/WASM and PraatStream. Reports check
source/derived pins and processing configuration before publishing. Generation
stages noise clips and validates the complete derived manifest before replacing
accepted files. Numerical results and playable charts are in
`outputs/pitch-comparison/practice/report.html`, deliberately ignored by Git.

Required small tests run in `test:core`: pitch confirmation, speech WASM/hash,
resampling/anti-aliasing, packet invariance, timestamps, disposal, scoring, reference
origins and boundary masking. Browser coverage includes preset migration/editing,
settings during playback, stable pause, complete grouped drawing, and history
pruning. An additional required fake-microphone test covers pitch capture and
settings without changing transport identity.

For the selected real soft-speaking recording, a separate local test used:

```sh
ffmpeg -i outputs/pitch-comparison/practice/avid/sp9_s1_para1_soft.wav \
  -ar 48000 -ac 1 -c:a pcm_s16le \
  outputs/pitch-comparison/practice/avid/chrome-soft.wav
SOUNDGLOW_PITCH_AUDIO="$PWD/outputs/pitch-comparison/practice/avid/chrome-soft.wav" \
  npx playwright test pitch-microphone.spec.cjs
```

This exercises browser microphone capture with recorded input; it is not a
physical phone test. Both desktop and mobile viewport runs passed. The full local
build passed 100 browser checks with five configured skips, plus core/update
checks; the subsequently added fake-microphone test passed independently with
both the standard fixture and the selected soft-speaking woman.
