# Hymn sources

The unmodified ABC files in `source/` are from the Open Hymnal Project, maintained by Brian J. Dumont, mirrored at https://github.com/mzealey/openhymnal (commit `d35811b2d5c9b0bbc5887d60a2936454815416e8`). Each selected source explicitly marks its words, music and setting public domain. Original credits and source references are retained in each file. These are historical editions, not modern commercial arrangements.

`catalogue.json` is a curated familiarity order, not a measured popularity ranking. Alternate titles are search aliases. The initial library contains 20 familiar hymns; one verse (and its refrain) is displayed to keep practice manageable.

Run `npm run import:hymns --workspace=notecards` to reproduce `src/hymns.json` entirely offline. The importer selects the first verse, normalizes older abcm2ps editorial decorations, and preserves the full harmony. Melody-only extracts the highest note of the first voice, retaining key, meter, duration, rests, ties, slurs, beaming and syllable alignment. Unsupported constructs or parser warnings fail the import instead of silently discarding music. Sources remain unchanged.

The app reads written durations but does not grade rhythm or play backing audio. With chords enabled it shows the source's harmonized score and waits for each new group of notes. MIDI recognizes exact sounding pitches; tied notes don't need to be re-struck. On-screen chords can be entered one key at a time.
