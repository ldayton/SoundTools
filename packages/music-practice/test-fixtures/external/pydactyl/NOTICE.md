# pydactyl synthetic reference data

Source: https://github.com/dvdrndlph/pydactyl
Pinned revision: 0ad656db9b778508453a7275dc698b9129ca765e
Copyright (c) 2014-2018 David A. Randolph. MIT; see LICENSE.

synthetic-cases.json contains only five literal ABC strings from
`test/TestConstant.py`: ONE_NOTE, TWO_NOTES, ONE_BLACK_NOTE_PER_STAFF,
TWO_WHITE_NOTES_PER_STAFF and FOUR_NOTES. They were extracted with Python's
standard-library ast.literal_eval; no external module/program was executed.
The named authorities in these toy strings are fictional. Their alternatives
exercise format/anchor contracts and are NOT human-reviewed musical goldens.
No PIG-derived data, scoring engine or runtime implementation is imported. manifest.json identifies the original file,
selected constants, saved-data hashes and source revision.

## Beringer reference addition

The `beringer2/arpeggios/` and `beringer2/broken_chords/` files are now also
retained from the same pinned MIT repository. Their headers credit Beringer and
Dunhill (1900), transcriber David Randolph, and explain that gaps were filled in.
These are therefore labelled `completed`, never promoted to printed-digit gold.
Whole reference alternatives stay separate. Only these data files, not the
upstream splitter, scorer, corpus parser, PIG data or other implementations,
were added. The full arpeggio family is the reserved new-source validation group;
broken chords are development data. Earlier wording about importing no repertoire
applies to the original synthetic-only phase, not this explicitly listed addition.

Trailing whitespace in the new Beringer source copies is removed to meet the
repository whitespace checks. Where changed, manifest entries retain both the
upstream byte hash (`upstreamSha256`) and normalized saved-file hash (`sha256`).
No pitches, rhythms, digit sequences or annotation provenance were changed.
