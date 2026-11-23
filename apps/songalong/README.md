# SongAlong

Piano hymn practice and playback. Uses NoteWise's shared React/Mantine application
shell with a teal theme. Includes melody/bass arrangements, independent visible
and practising hands, MIDI, passage selection/looping, tempo/count-in, and offline
use. Start with `npm run dev --workspace=songalong` from the repository root.

Hymnal sources and credits are in `hymns/`. Rebuild the library with
`npm run import:hymns --workspace=songalong`; runtime music remains in the shared
practice package. No source music or audio uploads are sent to diagnostics.

Build: `npm run build --workspace=songalong`. Logic: `npm test --workspace=songalong`.
Browser checks: `test:hymn-keys`, `test:hymn-playback`, `test:sight`, `test:offline`,
and `test:diagnostics`. These use their own preview servers. For `test:split`,
build both NoteWise and SongAlong first.

Amazing Grace offers Piano and Guitar editions. Piano retains the imported
Excell melody, including its pickup, ornaments, slurs and five-beat ties, with
held left-hand chords spanning no more than a fifth. The D7 shell uses F♯–A–C
without the root to keep the hand compact. Guitar carries the complete melody
one octave below Piano in first position, with no capo. G–B and E–B dyads,
C basses and the F♯–C shell of D7 support the melody without string conflicts;
all fretted notes lie within frets 1–3. Chord symbols retain the reviewed harmony.
Full G (320003), C (x32010), D7 (xx0212) and Em (022000) shapes remain available
for chord-accompaniment practice. Both editions reduce inner passing voices
and inversions while retaining the source's Em/C and dominant
changes. Each verse lasts 48 quarter-note beats, with a one-beat pickup and a
two-beat final bar. All three source verses and credits are retained.

Instrument selection is separate from notation/tab or chords-only display and
practice-part selection. Guitar practice offers Full fingerstyle, Melody, and
Chord accompaniment independently of the visible score. A hold dash in the
chords-only chart represents a tied continuation.
`test:editions` checks these controls and engraving in desktop and mobile sizes;
`TEST_BROWSER=webkit npm run test:editions --workspace=songalong` exercises WebKit.
The Amazing Grace unit tests independently verify melody, chord voicings,
harmonic rhythm, verse duration, lyrics, and passages beginning or ending on ties.

In Christ Alone's Guitar edition is a two-voice fingerstyle setting with the
complete source melody in conventional octave-transposing notation, capo 2.
C/E and G/D bass dyads, single F basses, and Am/E support the melody. The bass
rests on the high C–B leap in bar 10 so the hand can shift to position VII;
position III and I indications guide the return. Chord symbols retain the
original C/F/G/Am harmonic rhythm. The full fingerstyle setting is distinct
from the optional full-shape chord accompaniment used for strumming practice.

Notation, rhythmic tablature, combined notation/tab, and a compact chords-only
lyric chart are display choices of the same Guitar edition. They do not alter
playback or practice selection. Wait-for-me practice independently selects
Full fingerstyle, Melody, or Chord accompaniment. The third verse retains its
shorter ending. Tests compare the melody against Piano, check simultaneous
string/fret feasibility, section pitches, capo playback, both endings, and
independent display/practice persistence.

I'll Fly Away now offers Piano and Guitar only, using the existing reviewed
lesson progression: C/F/G7, with V7 on “fly” in bars 7 and 15 and tonic held at
the first endings. Both melodies sound one octave below the imported source
(G3–G4), preserving all 53 attacks, slurs, the chromatic D♯ neighbor, the written
rest, internal tie, and final fermata. Short notes are beamed by quarter-note
beat. The verse starts at bar 1 and the shared chorus at bar 9; all three verses
use the same 16-bar, 64-beat form. Playback uses the written fermata duration.

Piano uses C–E dyads, lower F triads and a rootless B–D–F G7 voicing. Omitting
the C chord's fifth avoids a key shared by the two hands; all left-hand voicings
fit within a fifth. Guitar stays in first position without a capo, reaching fret
4 for D♯. C–E dyads, F basses and B–F G7 shells support the melody; bar 13 uses
only C bass to free the middle finger for A. Full C, small F and G7 strums remain
available as independent chord-accompaniment practice. The optional lesson strum
pattern accompanies the chords-only display. Notation, tab, combined notation/tab
and the chord chart all represent the same Guitar arrangement; changing display
does not change the practice part. Fermatas remain visible in tab and chord view.

Jesus Loves Me offers Piano in E-flat and Guitar using C shapes with capo 3.
Piano preserves the imported melody register, with left-hand triads spanning
no more than a fifth. Guitar sounds the melody one octave below Piano and stays
within frets 0–3, using G bass where a low C melody occupies the fifth string.
Its rootless G7 shell leaves the melody clear. All 49 attacks, three verses and
the shared refrain retain the 16-bar form. Verse and refrain landmarks, explicit
capo instructions, independent display/practice options, full-shape chord
accompaniment and a chords-only lyric chart use the same two editions.


O Come, All Ye Faithful offers Piano in G and first-position Guitar without a
capo. Piano preserves the D4–D5 soprano with compact left-hand chords; Guitar
sounds the complete melody one octave lower. The reviewed accompaniment keeps
the secondary A7 and uses light basses/shells under Guitar, with fuller chord
shapes available for strumming practice (including a four-string Bm without a
barre). All 62 attacks, slurs, the breathing rest, one-beat pickup and three-beat
final bar remain intact. The refrain entrance is the last beat of bar 12.
Responsive systems attach the opening pickup and closing short bar to their
phrases; the chord chart retains changes beneath held melody notes. Display
and practice remain independent, with all three verses and shared refrain.

## Instrument playback

Playback reuses the existing audio-clock transport, count-in, passage loop,
seeking, tempo changes, score following, and offline verification. The selected
arrangement determines the sound; changing notation, tab, or chord display does
not change it. Interactive keyboard audition remains the existing piano voice.

Piano playback uses the licensed bitKlavier Steinway recordings at three recorded
strike strengths (layers 4, 8, 12), with roots every minor third from C2 to C7.
The compact stereo bank preserves up to six seconds of recorded decay, with a
120 ms key-release fade. Melody notes are brought forward over simultaneous
accompaniment. No automatic sustain pedal is applied across written rests.
Regenerate this bank with `python3 packages/music-practice/scripts/build-songalong-piano.py` (ffmpeg required).
Source hashes and recording credits are included in Settings and the offline pack.

Guitar playback reuses the existing CC0 Meta Steel Guitar bank: two recorded
strengths on each of six strings. Edition string positions are reused where
available, including capo and transposition; other notes get a deterministic
string assignment favoring low frets and unoccupied strings. A new note on the
same string damps the previous note. Fingerstyle attacks stay simultaneous as
written. Chord-accompaniment playback spreads attacks from low to high strings
by 9 ms per string, capped for short notes; selecting the chord display alone
does not introduce a strum. Guitar release is 45 ms. Simultaneous guitar chord attacks receive a 2 dB
boost relative to single-note plucks.

The performance layer preserves score pitches, rests, ties, and the practice
pulse. Samples are selected by instrument, pitch, dynamics and guitar string,
then loaded for the song's pitches and cached for later playback. Recordings
outside the bank's native range are pitch shifted; this is a compact sampler,
without pedal resonance, release recordings, randomized alternate takes, or
articulated guitar slides/hammer-ons. Piano and guitar notes decay with the
recording; organ notes sustain through the retained sample loops. The guitar voice is steel-string, not nylon-string.

Validation: `npm test --workspace=songalong`,
`npm run test:instrument-audio --workspace=songalong`, and
`npm run test:offline --workspace=songalong`. The instrument browser check renders
actual scheduled sample buffers and envelopes, checks finite unclipped audio and
instrument routing, and writes six-second WAV previews to
`/tmp/songalong-instrument-audio/`. Use `TEST_BROWSER=webkit` for WebKit.

## Primary instrument selection

The toolbar always shows Guitar, Piano and Voice + Piano as one radio group.
Only one instrument is selected; unavailable instruments remain visible and disabled.
The sidebar lists arrangements belonging to the current instrument, and omits the
arrangement picker when that instrument has only one arrangement. Reviewed editions
retain their Piano/Guitar scores; generic staged keyboard arrangements belong to
Piano and their original vocal harmony belongs to Voice + Piano. The supplied
In Christ Alone 2 choir/organ score currently supports Voice + Piano only.

Existing arrangement IDs still encode the saved instrument and arrangement together,
so old deep links, account records, offline preferences and bookmarks remain valid.
No microphone access is requested by the microphone icon. Arrow keys navigate the
available instruments, skipping unavailable choices; the three icons remain visible
when the phone's other toolbar controls are collapsed.

`hymn-instruments.test.ts` owns capability, migration and account/offline snapshot
coverage. `instrument-toolbar.browser.ts` is a required CI/Nightly witness for the
primary toolbar, exclusivity, keyboard access, persistence and responsive layout.
Existing edition browser tests retain each registered instrument edition's coverage
using the toolbar helper instead of the retired instrument dropdown.

## Teacher-score drawbar organ playback

In Christ Alone 2 explicitly declares `accompanimentInstrument: "organ"`; its
original Voice + Piano score uses the FreePats Drawbar Organ Emulation bank
for the Organ staves; its Choir track uses the human bank described below.
Other scores keep their existing sounds. The 2019-07-12 bank was recorded from
setBfree and is CC0; it is a Hammond-style emulation, not a physical Hammond
recording. The 16 roots total about 1.9 MiB in 24 kHz mono FLAC. Original pitch
zones and sustain loops are retained, with an 80 ms key release. The existing
transport, count-in, pause/resume, seek, transposition and volume controls are reused.

Every root's loop sustain is normalized to -26 dBFS RMS, with a -6 dBFS sample
peak ceiling. Playback gain 0.82 matches the complete 91-second teacher score
at 80 BPM to the existing piano reference before adding human choir: both
measure -16.7 LUFS integrated;
organ true peak is -4.8 dBTP (piano -1.2 dBTP). These are measured render levels,
not a promise that arbitrary scores have identical loudness. Existing piano and
guitar levels are unchanged. The existing output compressor remains in place.

Rebuild with `python3 packages/music-practice/scripts/build-songalong-organ.py
/path/to/DrawbarOrganEmulation-SFZ-20190712.tar.xz` (ffmpeg required). The builder
verifies the pinned archive hash and records original sample hashes, converted
loop points and measured levels. Credits and source hashes are available in
Settings and the verified offline pack. `organ-playback.test.ts` owns routing,
written timing and bank audit invariants. The existing CI toolbar witness checks
real organ routing, decoded normalization and a 12-second looped sustain; Nightly
instrument-audio and offline witnesses cover all three playback banks.

## Independent staff visibility and playback

Playback options now place a Staves table below Key & range and above Stanzas.
Each real staff has separate Show and Play checkboxes. Show removes the staff
from engraving without changing its audio; Play mutes every voice assigned to
that staff without hiding it. For the teacher score, the rows are Choir, Organ
treble (three voices together), and Organ bass. All-hidden and all-muted states
are supported; muting retains the complete score/stanza clock. No score width is
reserved for controls. Changes preserve playback position.

`hiddenStaves` and `mutedStaves` are normalized per-song settings, retained in
URLs, local/offline preferences and account records. They reset on arrangement
or legacy displayed-hand changes, so old staff indexes do not mute an unrelated
layout. Old view/hand links keep their prior visible/audible parts until the
table is edited. Wait-for-me hand controls remain separate. The selected key
now includes its actual octave range in parentheses; the separate range caption
and Melody limits helper text were removed. Key & range uses the same divider
section heading as the other options.

Chord diagrams have a play button beside their title. It previews the chord on
piano for two seconds including release, and cancels on replay, close or unmount.
Highlighted key labels use dark text, with larger lettering on black keys.

## Human choir for the teacher melody

The Choir track of In Christ Alone 2 now uses epic-choir v1.0 by thepok, derived
from the real singers of VocalSet (Wilkins, Seetharaman, Wahl and Pardo, 2018).
The Organ tracks retain the drawbar organ. The compact bank contains ten
alto-section ah/mf roots, covering the teacher melody at its original pitch,
in 24 kHz stereo FLAC (about 3.7 MiB). It sings open vowels, without lyrics.
The CC BY 4.0 attribution, original and adaptation details, archive/sample hashes
and measured levels are bundled and available through Settings and offline.

Each root's 0.25–2.25 second sustain window is normalized to -26 dBFS RMS with a
-6 dBFS sample peak ceiling. Choir playback gain 1.85 balances its breath/ensemble
envelope against the existing organ gain 0.82. A full 91-second teacher-score
render at 80 BPM measures -16.9 LUFS integrated and -3.3 dBTP, against -16.7 LUFS
for the piano reference. Piano and guitar levels are unchanged.

Rebuild with `python3 packages/music-practice/scripts/build-songalong-choir.py
/path/to/epic-choir-v1.0-A.zip` (ffmpeg required). This verifies the pinned archive
hash and applies the upstream SFZ's 80 ms sample offset before conversion.
Source: https://github.com/thepok/epic-choir
Original voices: https://doi.org/10.5281/zenodo.1442513

## Teacher-based In Christ Alone instrumental editions

`in-christ-alone-2` retains its original Voice + Piano score and now also offers
Piano and Guitar editions. Both follow the printed vocal melody, including rests
and dotted rhythms, and carry the organ’s upper line through the instrumental
ending. The pickup and final half-bar complete a 60-beat written pass; the
printed repeat remains. All four verses use that form, without the older vocal coda.

Piano uses compact left-hand voicings for the teacher’s D/F♯, Bm and Em changes.
Guitar reuses the existing capo-2 C-family shapes and position/fingering helpers,
with C/E, Dm and G7 for the fuller harmony. The interlude follows the printed A7
and fifth-bass motion back to D. Melody, fingerstyle, strummed accompaniment,
passages, transposition and the staff playback controls use the shared edition
pipeline. The older `in-christ-alone` song remains unchanged.

Exact music and physical string choices are covered by
`tests/in-christ-alone-2-editions.test.ts`; responsive rendering, instrument
switching and saved choices are covered by the corresponding Nightly browser test.

Playback highlights current notes in green while running; a translucent position
band appears when paused or ready. Reviewed guitar scores list Tablature as a
separate Show control, with Play disabled because the Treble staff owns its audio.
Chord symbols have an independent per-song Show preference, retained in URLs,
local/offline saves and account records. Both visibility controls preserve notes
and playback timing. Guitar capo/sounding key appear on the score; shape details
remain in the reading guide. The teacher guitar edition uses three bars per
desktop system, and the original Choir/Organ names appear only on its first system.
