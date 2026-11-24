# Recommended capo positions

The guitar Key control chooses the sounding key. The Capo control chooses a
playable shape family for that same key; it does not transpose the performance.
Original remains the key default and the reviewed score's capo remains selected
until the player chooses another position.

The advisor reuses the chord-symbol parser, familiar-shape catalog, voicing search
and strict finger/barre validator from `guitar-chord-search.ts`. That implementation
was recovered from the earlier `feat/guitar-chord-search` branch, rather than
creating a second difficulty model. See [its research](guitar-chord-search-research.md).
The physical rule agrees with [D'Addario's capo guide](https://www.daddario.com/globalassets/pdfs/accessories/daddario_capo_guide.pdf):
shape pitch plus capo fret gives sounding pitch.

For each candidate the advisor checks every melody and bass pitch, including
held-note overlaps. It rejects string collisions, unreachable frets and grips
that cannot be assigned four fingers with valid barres. A conservative global
pitch-to-string assignment preserves the existing tablature renderer's contract;
it can omit a valid context-dependent fingering, so the choices are recommendations,
not a claim to enumerate every playable arrangement.

Candidates include frets 0–7 and the reviewed score's transposed setting, up to
fret 11. Ranking combines familiar chord shapes, mean and hardest chord cost,
actual fingerstyle grip effort, hand-position movement and a small preference for
lower capos. The shortlist has at most three useful choices and retains the
validated score setting. Internal costs are ordering values, not difficulty
percentages. In Christ Alone's exact low bass and melody support its capo-2 C
shapes; no extra positions are invented merely to populate a menu.

The full fingerstyle performance keeps its exact sounding pitches. The separate
chord-accompaniment exercise uses ranked playable voicings for alternate capos;
chord tones can change octave or doubling, while chord identity, sevenths and
requested slash bass remain intact. The reviewed score setting keeps its authored
accompaniment unchanged. Chord labels, tablature, diagrams, fingering hints,
playback and MIDI grading use the selected setting together.

The control appears only for dedicated guitar editions with a harmonic guide.
The instrumental blues edition has no such guide and retains its existing key
and fingering behavior. Capo selection is saved with key and octave in the account
pitch record, included in share URLs, and scopes practice checkpoints. Selecting
a different key returns to its reviewed score setting.
