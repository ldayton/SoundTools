# Hymn sources

The unmodified ABC files in `source/` are from the Open Hymnal Project, maintained by Brian J. Dumont, mirrored at https://github.com/mzealey/openhymnal (commit `d35811b2d5c9b0bbc5887d60a2936454815416e8`). Each selected source explicitly marks its words, music and setting public domain. Original credits and source references are retained in each file. These are historical editions, not modern commercial arrangements.

`catalogue.json` is a curated familiarity order, not a measured popularity ranking. Alternate titles are search aliases. The library contains ten songs: 1st Fingerstyle Blues, Amazing Grace, Blessed Assurance, I’ll Fly Away, In Christ Alone, Jesus Loves Me, O Come, All Ye Faithful, Joy to the World, Silent Night and Are You Washed in the Blood? The first stanza is selected initially; the Stanzas checkboxes add aligned lyric rows. Common choruses and refrains are shown once, even when the first stanza is hidden. Playback and Wait for me continue through the checked stanzas in order, including the refrain on every pass. Playback uses one uninterrupted audio timeline and does not insert count-ins between stanzas; passage looping remains confined to the selected passage. The active stanza and its practice checkpoint are retained per hymn. With no stanzas checked, the music plays once without words.

Run `npm run import:hymns --workspace=songalong` to reproduce `packages/music-practice/src/hymns.json` entirely offline. The importer extracts all underlaid `w:` stanzas (not unaligned `W:` text), normalizes older abcm2ps editorial decorations, and preserves the full harmony. Melody-only extracts the highest note of the first voice, retaining key, meter, duration, rests, ties, slurs, beaming and syllable alignment. Unsupported constructs or parser warnings fail the import instead of silently discarding music. Sources remain unchanged.

The app supports playback and Wait for me practice, including separate-hand practice and optional re-striking of tied notes. MIDI recognizes exact sounding pitches. Octave-displaced notation uses a small 8 or 15 below the treble or bass clef; it does not change the sounding pitch.

`lyrics.json` contains user-supplied, manually aligned practice lyrics for Amazing Grace, Jesus Loves Me and O Come, All Ye Faithful. Repeated copies of the same stanza are omitted. In Christ Alone’s four verses are underlaid in its teacher-score ABC; all retain the instrumental ending. Source ABC files and their credits remain unchanged. Reference recording links are separate catalogue metadata.

## Tab-music practice editions

“I'll Fly Away” (Albert E. Brumley) is adapted from Lily's `ldayton/tab-music`
repository at commit `e45c0e6b77901f4bb2495ae0412e0dff1a112dd0`.
`ill-fly-away-tab-music.abc` retains its source credits and catalogue reference.
It is a user-supplied practice edition, not an Open Hymnal/public-domain edition.
Its melody is in C major, G4–G5, with the user's melody revisions.
Song rights remain with the respective rights holders.

## User-supplied guitar score

“1st Fingerstyle Blues” is transcribed from Lily’s supplied GuitarNick score
and tab, credited to Nicola Mandorino (2015). Rights remain with the respective
rights holders. The two voices retain sounding guitar pitches, the twelve-bar
repeat, bass turnaround and final E7 chord. Conventional eighth notes and a single Swing indication retain the source’s
notation. Playback and score following apply the 2:1 swing timing separately;
no lyrics are supplied.

For this song, the arrangement menu contains only Piano and Guitar. Piano
retains the melody in the right hand and bass in the left on a grand staff.
Guitar retains both fingerstyle voices on one octave-transposing treble staff,
with the supplied string/fret choices. Notation, tablature, and combined views
are independent display settings; practising either hand or guitar voice does
not remove the other voice from the displayed score. Legacy arrangement links
and saved choices are mapped to the corresponding instrument edition.

The beginner editions add printed bar numbers and boxed A/B/C four-bar phrase
landmarks, followed by Ending. Fingerings are manually selected for the source
key/position: piano hand patterns and changes; guitar fretting fingers, selected
string numbers and the opening i–m melody / p bass pattern. They can be toggled
without changing the notes. Tab-only view includes independent rhythmic voices,
rests, ties and double-stemmed half notes. All annotations are separate from
playback and grading.

The piano ending omits the guitar chord’s inner doubled E, keeping the final
left-hand E–B within a fifth while retaining the E7 harmony and melodic E.

The final engraving pass uses the same type size for attacked and tied fret
numbers, with explicit ties in rhythmic tab. Single-note guitar fingerings sit
opposite the voice stems; chord fingerings remain in aligned columns. Systems
are trimmed to their visible musical content, and the final staff uses the
same right margin as the preceding systems. Layout checks cover 320, 390,
768 and 1440 pixels, including annotation clipping and note/accidental collisions.
Piano sounding overlaps are checked for hand spans of at most a sixth; the
source guitar voicings are checked for distinct strings within a three-fret
position. These checks do not change the supplied notes or playback timing.

## In Christ Alone — teacher's printed choir and organ score

`in-christ-alone.abc` is the canonical transcription of the two photographs supplied
on 23 November 2026. It replaces the retired tab-music edition, including its ID. The photos are in E-flat major; at the user’s request, every voice is transposed
down one semitone to D major, which is now this song’s Original key. The
transcription retains the printed 3/4, “Steadily,”
choir plus a two-staff organ part, four complete printed verses, 21 numbered
measures, inner-voice ties, the organ interlude and the final repeat. Teacher pencil chord letters are now included, using the fullest suggestions:
D/F♯ in bars 11 and 15, Bm in bar 12, and Em in bar 19. Other pencil
corrections and circles are excluded. The score prints no numeric
tempo; the app's adjustable 80 BPM starting tempo is not a source marking.

The opening and final measures each last three eighth notes; a single written
pass lasts 60 quarter-note beats. The printed repeat remains in the source and
is interpreted normally by playback. The choir finishes in bar 17 while the
organ continues through bar 21. The organ's half-note harmony under the moving
line in bar 18 uses an additional voice on the same treble staff. All four lyric
rows come from these photographs, including the second verse and the printed
“There in the ground” opening; there is no added “Oh” refrain.

The song opens on Voice + Piano, using Original harmony to show the supplied
three-staff arrangement. Piano and Guitar are dedicated adaptations of the same teacher form, including
the interlude and ending.
The About this song link downloads the bundled transcription and remains valid
offline. This user-supplied arrangement is not an Open Hymnal/public-domain source;
song rights remain with their respective holders. Instrumental adaptations are separately authored and verified.

Independent photo-derived MIDI pitch/duration expectations are owned by
`in-christ-alone-score.test.ts` in CI's SongAlong unit group. The focused
transcription/browser witness belongs to Nightly's SongAlong core group; the
catalog partitions also include the new song automatically. This adds no
exhaustive browser work to the bounded CI lane. The actual-clef hand-selection
regression is included in the same unit owner.

The teacher chord letters are clickable. Their dialog reuses the shared piano
keyboard, with a compact triad voicing and its octave-qualified notes ordered
from bass to treble above the keys. Slash chords use the indicated bass note.
These chord examples do not replace the printed organ voicing or add synthesized
accompaniment to playback; transposition updates both symbols and diagrams.

The teacher score now declares organ instrumentation explicitly. The organ staves use
the bundled, level-normalized CC0 FreePats drawbar organ, with sustain loops for
long organ notes; the toolbar grouping remains Voice + Piano.

The Choir track now uses the normalized alto ah/mf section from epic-choir,
derived from VocalSet under CC BY 4.0, while the four organ voices remain on
organ. Staff visibility and sound are independently controlled by the Staves
table in Playback options; this does not change any printed music or lyrics.

## Complete arrangement support

All ten retained songs now have dedicated guitar and piano editions. The nine
songs with lyrics also offer Voice + Piano; Fingerstyle Blues stays instrumental.
See [the checked support matrix](../../../docs/songalong-song-support.md) for
source provenance, musical scope, practice stages and validation owners.

## Are You Washed in the Blood? — supplied SATB score

`are-you-washed-in-the-blood.abc` transcribes the Michael Kravchuk A-flat SATB
setting from the supplied Favorite-Scores archive. The source URL and exact PDF
SHA-256 are in the transcription header. Words and music are credited to Elisha
A. Hoffman; setting credit and rights provenance remain separate from the Open
Hymnal sources. This is a supplied practice score, not a claim that the modern
setting is public domain.

All four parts, four underlaid verses and the common refrain are preserved,
including the lower voices' rhythmic echoes and rests. The D-natural in
measure 3 belongs to Bb7/F and resolves to D-flat in the next measure. The
refrain starts with a pickup on the last beat of measure 8. A one-beat opening
and three-beat ending complete a 64-beat pass; each selected verse includes the
refrain. Shared lyric sections keep it engraved once.

The song opens on Voice + Piano, with an independent singer above the full
source harmony. Dedicated Piano, fingerstyle Guitar and Guitar + Voice reuse
the edition registry and shared controls. Guitar uses open G-family shapes at
capo 1, with its instrumental melody an octave below the vocal line. Piano
chords and guitar bass/string choices are authored practice adaptations, not
changes to the archival SATB. See `docs/songalong-song-support.md` for their
musical contract and regression owners.
