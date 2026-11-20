# Guitar chord search

The shared music-practice package now provides a logic-only chord search. It has
no UI, audio, persistence or network calls. All fret and finger vectors run from
the **low-E side to the high-E side**: `null` means muted, fret `0` means open,
and fingers `1–4` mean index through little finger. Open strings use finger `0`.

## Try it

From the repository root:

```sh
npm run chords --workspace=@ldayton/music-practice -- "C, F, Bm" --limit 5
npm run chords --workspace=@ldayton/music-practice -- "Am7, D/F#, C7(b9,#11)" --json
npm run chords --workspace=@ldayton/music-practice -- "F" --no-barres --max-fret 5
```

For machine-readable output without npm's script banner, use
`npm run --silent chords --workspace=@ldayton/music-practice -- "C" --json`.
Invalid symbols or constraints exit with code 1; a valid search with no matches
returns an empty list and exits successfully.

The API is exported as `@ldayton/music-practice/guitar-chords`:

```ts
import { searchGuitarChords } from "@ldayton/music-practice/guitar-chords";

const result = searchGuitarChords("F", {
  allowBarres: false,
  maxFret: 5,
  limit: 10,
});
// result.chord: parsed symbol, root, slash bass and spelled intervals
// result.total: all matches, before pagination
// result.voicings: frets, sounding notes/MIDI, fingers/barres,
//                  omitted degrees and ranking features/reasons
```

`parseChordSymbol` and `parseChordSymbols` are also available. A comma inside
parenthesized alterations belongs to that chord; it does not split the list.
Aliases include `Δ`, `Δ7`, `Δ9`, `ø7`, `°`, `min`, and Unicode accidentals.
`C6/9` is distinct from a slash-bass chord such as `D/F#`.

## Default ordering

Hard constraints always come first. A familiar shape never bypasses a filter.
All valid candidates are ranked before pagination; discovery order does not
decide which shapes appear on the first page.

1. **Familiar beginner shapes:** conventional open chords and small teaching
   shapes come first. Familiar variations follow according to their finger,
   barre and stretch costs plus a small variation penalty. Conventional finger
   assignments are preferred when they satisfy the requested constraints.
2. **Other shapes:** a combined cost favors fewer fingers, shorter barres,
   smaller stretches, lower positions and fewer internal muted strings. Common
   movable forms receive a familiarity bonus, balanced against their physical
   cost and position. High-neck full barres do not automatically outrank simple
   low-position alternatives.
3. **Ties:** fret vectors provide a deterministic tie break.

Representative default results:

| Chord | Leading shape(s), low E to high E | Reason |
| --- | --- | --- |
| C | `x32010` | Familiar open C precedes unfamiliar sparse voicings |
| G | `320003`, then `320033` | Three-finger version before four-finger variation |
| A | `x02220` | Conventional three-finger assignment, rather than forcing a barre |
| F | `xx321x`, then `xx3211` | Small F before the four-string mini-barre; full F comes later |
| Bm | `x24432` | Familiar low-position minor barre |
| C9 | `x32333` | Conventional ninth shape |
| C13 | `x32335` | Conventional thirteenth shape |

The small-F sequence follows [Fender's teaching progression](https://www.fender.com/articles/chords/learn-how-to-play-f-chord-on-guitar).
The catalog is independently authored from conventional shapes. Its familiarity
tags are curated judgments, **not measured popularity counts**. Ranking cost is
an internal preference score, not a difficulty percentage or a universal claim
about a player's hands. Each result exposes the factors used for its ranking.
Progression-dependent transition difficulty is a separate future concern.

## Constraints

| API option | Default | Meaning |
| --- | --- | --- |
| `tuning` | `[40,45,50,55,59,64]` | Six open-string MIDI pitches, low-E-side first; alternate/reentrant tunings accepted |
| `minFret`, `maxFret` | `0`, `12` | Fretted-note bounds, up to fret 24; open strings controlled separately |
| `maxFretSpan` | `4` | Maximum difference between highest and lowest pressed frets, configurable 0–5 |
| `minStrings`, `maxStrings` | `3`, `6` | Number of sounding strings, configurable 2–6 |
| `maxFingers` | `4` | Fretting-finger budget, configurable 0–4 |
| `allowBarres` | `true` | Permit one finger to press multiple strings at one fret |
| `allowOpenStrings` | `true` | Permit open strings even above `minFret` 0 |
| `requireOpenString` | `false` | Require at least one open string |
| `maxMutedGaps` | `0` | Total muted strings inside the played span, configurable 0–4 |
| `bass` | `"root"` | Root in the bass; `"any"` allows inversions; explicit slash bass always enforced |
| `voicingPolicy` | `"practical"` | Optional perfect fifth for four-plus-tone chords; optional natural ninth in 11th/13th families |
| `limit`, `offset` | `20`, `0` | Pagination after global ranking; limit 1–1000 |

`"complete"` requires every tone in the parsed formula. Both policies preserve
the defining third, seventh and explicit alterations. The practical policy
does not permit rootless voicings. Omitted degrees are reported explicitly.
The lowest **sounding MIDI pitch**, including with reentrant tuning, must match
the bass policy. A non-chord slash bass is added to the allowed notes.

CLI equivalents: `--min-fret`, `--max-fret`, `--span`, `--min-strings`,
`--max-strings`, `--fingers`, `--gaps`, `--no-barres`, `--no-open`,
`--require-open`, `--any-bass`, `--complete`, `--limit`, `--offset`, and
`--tuning "38,45,50,55,59,64"`.

## Fingering and limits

The solver covers fretted contacts with separate fingers or legal barres, then
assigns up to four fingers. A barre cannot cross an open, muted or lower-fretted
string. Fingers follow conservative ordering/reach constraints. Repeated fret
numbers alone do not establish a usable fingering.

This is a conservative model: no thumb wrapping, bent barres, finger rolls,
hand-size calibration, capo labels, sequence optimization or contextual rootless
jazz voicings. Custom tuning uses the same model but does not reuse familiar
standard-tuning labels. Tonal's supported explicit formulas define the initial
vocabulary; unknown symbols and ambiguous `alt` are rejected rather than guessed.
An empty result can mean the constraints are too restrictive, not that the chord
is impossible on every guitar or for every player.

Regression coverage includes familiar-first ordering, all twelve roots across
22 chord families, catalog fingerings, harmonic/bass invariants, explicit
omissions, alternate tuning, restrictive filters, stable pagination, CLI errors
and an independent small-fretboard exhaustive comparison.
