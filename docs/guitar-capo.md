# Recommended capo positions

The guitar Key control chooses the sounding key. The Capo control chooses a
playable shape family for that same key; it does not transpose the performance.
Original remains the sounding-key default. The engine's highest-ranked playable
choice is selected automatically; a numeric user preference overrides it.

The advisor reuses the chord-symbol parser, familiar-shape catalog, voicing search
and strict finger/barre validator from `guitar-chord-search.ts`. That implementation
was recovered from the earlier `feat/guitar-chord-search` branch, rather than
creating a second difficulty model. See [its research](guitar-chord-search-research.md).
The physical rule agrees with [D'Addario's capo guide](https://www.daddario.com/globalassets/pdfs/accessories/daddario_capo_guide.pdf):
shape pitch plus capo fret gives sounding pitch.

For solo guitar, the advisor checks every melody and bass pitch, including
held-note overlaps. It rejects string collisions, unreachable frets and grips
that cannot be assigned four fingers with valid barres. A conservative global
pitch-to-string assignment preserves the existing tablature renderer's contract;
it can omit a valid context-dependent fingering, so the choices are recommendations,
not a claim to enumerate every playable arrangement.

Candidates include every fret from 0–11, uniformly. Ranking combines familiar chord shapes, mean and hardest chord cost,
actual fingerstyle grip effort, hand-position movement and a small preference for
lower capos. The automatic shortlist has at most three useful choices. The internal reference
arrangement receives no selection priority or reserved slot. A physically valid
explicit user choice can extend the shortlist without displacing recommendations. Internal costs are ordering values, not difficulty
percentages. In Christ Alone's exact low bass and melody support its capo-2 C
shapes; no extra positions are invented merely to populate a menu.

The full fingerstyle performance keeps its exact sounding pitches. The separate
chord-accompaniment exercise and Guitar + Voice use ranked playable voicings;
chord tones can change octave or doubling, while chord identity, sevenths and
requested slash bass remain intact. Guitar + Voice revoices even at the reference
capo, since a reference grip should not prevent the engine finding easier choices.
Single-note instrumental fills keep their exact pitches and rhythm. Generated
chords omit redundant accidentals while retaining necessary cancellations. The
solo reference arrangement retains its authored accompaniment when explicitly
chosen or independently recommended. Chord labels, tablature, diagrams, fingering hints,
playback and MIDI grading use the selected setting together.

The control appears only for dedicated guitar editions with a harmonic guide.
The instrumental blues edition has no such guide and retains its existing key
and fingering behavior. Capo selection is saved with key and octave in the account
pitch record, included in share URLs, and scopes practice checkpoints. Selecting
a different key returns to the engine recommendation. Null/absent saved capo
means automatic; numeric choices remain explicit through reloads and instrument
switches when physically valid. Older explicit `capo=score` links resolve to a
numeric reference position rather than silently becoming automatic.
