# Instrument and Voice combinations

Guitar and Piano are mutually exclusive radios. Voice is a separate pressed
button. Switching instruments preserves Voice; clicking the selected instrument
does not deselect it. Unsupported combinations are disabled per song. Blues is
instrumental and has no Voice option.

Each combination owns one persisted score ID, rather than conflicting boolean
fields: Piano (`piano`), Piano + Voice (`original`, preserving existing links),
Guitar (the edition's existing guitar ID), Guitar + Voice (`guitar-vocal`).
Bookmarks, account preferences and URLs distinguish all four scores. Unsupported
Guitar + Voice links fall back to the song's instrumental guitar score.

The instrumental guitar score carries melody and bass. Guitar + Voice uses the
separate chord-accompaniment part and an independent vocal melody. Piano + Voice
retains the source vocal/accompaniment score; Piano alone retains its existing
solo adaptation. Neither vocal combination is simply the instrumental solo
with a duplicate vocal staff.

For Guitar + Voice, the vocal staff shows concert pitch and the guitar staff
shows capo-relative written pitches and chord shapes. Each staff has its own key;
the guitar's MIDI transposition includes its conventional octave and capo.
Changing capo changes guitar shapes without moving the singer. Guitar diagrams
are taken from guitar notes only, never from a union with the vocal melody.
The combined guitar score currently shows notation and chord diagrams; solo
guitar retains its tablature display choices.

Playback assigns the vocal staff to the choir sampler and accompaniment to its
instrument sampler. Strum timing and string damping are applied only to guitar.
The staff table independently controls visibility and playback. Desktop part
practice can grade Voice, Guitar accompaniment, or both.

`guitar-voice.test.ts` owns the independent pitch/timing/part/selection checks for
every production edition. Existing musical baseline hashes continue protecting
the pre-existing instrumental scores. The critical guitar browser check owns
four-combination selection and persistence; the all-edition guitar browser check
and instrument toolbar witness cover the registry and responsive interaction.
