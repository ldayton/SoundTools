# Hymn sources

The unmodified ABC files in `source/` are from the Open Hymnal Project, maintained by Brian J. Dumont, mirrored at https://github.com/mzealey/openhymnal (commit `d35811b2d5c9b0bbc5887d60a2936454815416e8`). Each selected source explicitly marks its words, music and setting public domain. Original credits and source references are retained in each file. These are historical editions, not modern commercial arrangements.

`catalogue.json` is a curated familiarity order, not a measured popularity ranking. Alternate titles are search aliases. The initial library contains 20 familiar hymns; one verse (and its refrain) is displayed to keep practice manageable.

Run `npm run import:hymns --workspace=notecards` to reproduce `src/hymns.json` entirely offline. The importer selects the first verse, normalizes older abcm2ps editorial decorations, and preserves the full harmony. Melody-only extracts the highest note of the first voice, retaining key, meter, duration, rests, ties, slurs, beaming and syllable alignment. Unsupported constructs or parser warnings fail the import instead of silently discarding music. Sources remain unchanged.

The app reads written durations but does not grade rhythm or play backing audio. With chords enabled it shows the source's harmonized score and waits for each new group of notes. MIDI recognizes exact sounding pitches; tied notes don't need to be re-struck. On-screen chords can be entered one key at a time.

## Tab-music practice editions

“In Christ Alone” (Keith Getty and Stuart Townend) and “I'll Fly Away”
(Albert E. Brumley) are adapted from Lily's `ldayton/tab-music` repository,
commit `e45c0e6b77901f4bb2495ae0412e0dff1a112dd0`. The two
`*-tab-music.abc` files are the checked-in import sources; catalogue entries
link to the exact LilyPond revisions. These are user-supplied practice editions,
**not Open Hymnal or public-domain editions**. Song rights remain with their
respective rights holders.

The melody uses the keyboard edition's written register: In Christ Alone is
D major, A4–D6, including its original pickup and four-bar Oh ending; I'll Fly
Away is C major, G4–G5, verse and chorus, with the user's melody revisions.
Slurs, ties, rests, dotted rhythms, lyrics and the closing fermata are retained.
The audio-only expressive timing on “God's ce-” remains straight eighths in the
notation, as in the source keyboard score. The lower voice uses the source's
simplified chord changes, in compact piano voicings. “Original harmony” here
means that imported practice harmony, not a published SATB arrangement.

`tests/fixtures/tab-music-melodies.json` records the independently rendered
keyboard MIDI pitches and durations from that revision. I'll Fly Away is
raised one octave to match its printed keyboard score; its two expressive
MIDI eighths are normalized to their printed half-beat lengths. Tests compare
every melody attack and tied duration against this reference.
