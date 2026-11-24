# Approved backing arrangements

The production player realizes the approved sixteen-bar ensemble conversations
from `packages/music-practice/src/backing-phrases/approved.json` across the
existing full song forms. Each genre has its own rhythm, instrumentation, reply
windows, phrase lift and cadence. Steady simplifies the active score; subsequent
cycles alternate its two eight-bar halves. Guitar voicings are assigned to
physical strings and native sample pitches in the selected key and scale.
The existing dedicated maqam harmony remains the owner of maqam backing.

`approved-mix.json` records the user's selected instrument balances in dB.
`BackingMixer` applies these independently per instrument before the relative
0–200% user faders. Thus 100% means the approved balance, including distinct
acoustic/twang guitar gains in country and organ/piano gains in gospel.
Existing app mixer saves remain relative percentages; no storage migration or
comparison-page settings are added to the app. The A/B comparison page and WAVs
remain local review tools and are not shipped.

Scores were written locally. Selected rock, funk and strummed inter-string
stroke timings derive from GuitarSet 1.1.0 annotations, CC BY 4.0, from
`00_Rock1-130-A_comp.jams`, `01_Funk1-97-C_comp.jams`, and
`01_SS3-98-C_comp.jams`. GuitarSet: Qingyang Xi, Rachel Bittner, Johan Pauwels,
Xuzhou Ye and Juan Pablo Bello, *GuitarSet: A Dataset for Guitar Transcription*,
ISMIR 2018. Source: <https://github.com/marl/GuitarSet>;
license: <https://creativecommons.org/licenses/by/4.0/>.
Musical rhythms, voicings, bass phrases and drum replies were rewritten for the
ensemble. MMA supplied the arranging approach; no downloaded software runs in
preparation or production. Native instrument recordings retain their existing
asset licenses.

Coverage: `backing-approved.test.ts` is discovered by shared CI music units.
It owns all nine preset scores, every key and supported diatonic scale family,
voice gates, reply spaces, ongoing instrument participation and chosen gains.
`authored-backing.browser.ts` owns real player wiring in the existing Nightly
backing suite. `audit-backing-loudness.mts` measures rendered PCM and true peaks.
Legacy score tests remain regression owners for the reference arrangers used
as musical-form inputs and historical comparisons.

Production calibration removes historical cross-stick compensation that belonged
to the old scores and moderates Gospel's section envelope. Both adjustments
multiply every instrument together within a section. Factory output trims target
approximately -24 LUFS after the chosen instrument balance; the latter remains
unchanged. The dedicated maqam fallback retains its previous factory trim.
The PCM audit reuses decoded recordings between configurations, restoring both
live context and live buses after each independent offline render. Every complete
score still receives its own graph, voice counters, meter and assertions.
