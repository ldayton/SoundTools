# Phrase boundaries and movement-model evaluation

## Acceptance criteria

- Preserve explicit internal double/final bars and repeat boundaries through the
  shared score adapter, per original staff/voice and across notation lines.
- A boundary changes melodic context, not the notation clock, pitch, authored
  fingering, key hold or tie identity. Ordinary single bars are not phrase breaks.
- Reimport pinned permissive references using the same adapter. Reference digits
  remain separate from planner inputs; evidence and partition identities stay intact.
- Keep all existing per-family default and experimental benchmark floors. Reject
  movement/preference candidates that regress development families; do not lower
  assertions to accommodate them.
- Preserve exact decoding, bounded resources and complete-hand diagnostics.
- Validate adapter wiring in both browser engines, independent short-path oracles,
  the registered full piano corpus and applicable local CI.
- Do not promote the experimental model on consumed validation data. No external
  implementation, optimizer, training program or tests execute.

## Findings

The missing phrase metadata was confirmed. `collectPianoScore` now carries a
pending boundary independently for each original staff/voice, consumes it at the
next pitched event and preserves it over rests/line wraps. This recognizes ABC
`bar_thin_thin`, `bar_thin_thick`, and left/right/double repeats. It does not infer
phrases from arbitrary ordinary bars. This is conservative score segmentation,
not a complete theory of musical phrasing. Tied continuations retain their contact
identity and are never released merely because of a boundary.

Scoring and returned frame costs now share the same cached transition function;
there is no separate replay of transition logic for diagnostics.

Two movement/preference candidates were implemented, tested and rejected:

- A local released-note thumb pivot used movement `2 + 0.8 * anchor distance`,
  with crossing digits 2–4, at most five semitones / 3.1 white-key units, and
  at most seven anchor units. Its contextual variant additionally required an
  uninterrupted same-voice monotonic gesture spanning at least an octave, with
  at least four attacks and consecutive intervals of 2–5 semitones. Chords,
  holds, silence and explicit phrase boundaries interrupted eligibility.
- A directional preference omitted static pair-span costs for reversed finger
  order, including the outer pair in the three-attack context feature.

These plausible changes did not improve the development evidence. Their combined
and isolated effects are retained in `piano-phrase-evaluation-results.json`.
Production source retains neither candidate. In particular, a large movement cost
in an audit does not prove that reducing it will improve complete phrases.
A model needs more than a locally cheap crossing: changing that cost changes all
competing paths, including undesirable repeated pivots.

The first boundary test incorrectly demanded an internal boundary in every
Beringer file. Inspection showed broken-chord files have no such internal marker;
the regression assertion now requires boundaries for the arpeggio files that
actually contain them. This was a stale test assumption, not missing music.

## Retained results

| Corpus group | Default matches before/after | Experimental matches before/after |
| --- | ---: | ---: |
| Printed development, 5,615 labels | 2,904 / 2,904 | 3,227 / 3,227 |
| Printed historical validation, 2,332 labels | 1,391 / 1,391 | 1,635 / 1,635 |
| Completed broken chords, 1,536 labels | 1,184 / 1,184 | 1,293 / 1,293 |
| Completed arpeggios, 5,136 labels | 2,246 / 2,246 | 2,133 / 2,258 |

Arpeggio agreement improves from 41.53% to 43.96% for the opt-in model.
Coverage is unchanged. All prior family floors remain; the experimental arpeggio
floor is raised to retain the 125 additional matches. This remains consumed
validation evidence, not a fresh generalization or promotion claim.

## Research basis and next experiment

Randolph et al. (2023) explicitly use segment boundaries and segment Beringer at
internal double bars. Parncutt et al. (1997) distinguish movement, thumb passage,
span and broader pattern consistency. Their direction-dependent ranges should not
be reduced to simply dropping costs whenever fingers cross. MIT pydactyl and
PianoPlayer remain read-only references, not executed comparison oracles.

The next movement experiment should jointly represent pivot preparation and
completion across three or more attacks, with signed finger-pair ranges and
independent hand/key-level examples. Calibrate its weights using grouped
training/development phrases before consuming any new reserved source. A local
thumb discount and aggregate note-match gain are insufficient promotion evidence.
Fresh source groups are still required before changing the production default.

- https://nlp.lab.uic.edu/wp-content/uploads/sites/314/2023/06/Randolph_CRF2.pdf
- https://static.uni-graz.at/fileadmin/_Persoenliche_Webseite/parncutt_richard/Pdfs/PaSlClRaDe97_FingeringModel.pdf
- https://github.com/dvdrndlph/pydactyl
- https://github.com/marcomusy/pianoplayer
