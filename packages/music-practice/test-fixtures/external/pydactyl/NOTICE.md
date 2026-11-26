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
No associated repertoire corpus, PIG-derived data, scoring engine or runtime
implementation is imported. manifest.json identifies the original file,
selected constants, saved-data hashes and source revision.
