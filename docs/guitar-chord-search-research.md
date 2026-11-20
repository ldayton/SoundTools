# Guitar chord search: logic-first research

Researched 20 November 2026. The first logic-only milestone is now implemented;
see [usage and ranking rules](guitar-chord-search.md). Tonal 6.3.1 is the production
parser dependency, behind our adapter. The other packages remain research
references. Experiments and downloaded papers live under ignored
`work/chord-search-research/`. The recommendations below record the research
that informed this milestone.

## Distinct problems

1. **Symbol meaning:** preserve the root, chord quality, intervals, spelling,
   extensions/alterations/explicit omissions, and any requested bass note.
2. **Voicing:** choose sounding pitches and their strings/frets, allowing doubling
   and only deliberately permitted omissions.
3. **Fingering:** assign actual fingers and barres without suppressing a required
   open string or conflicting with another finger.
4. **Ranking:** separate hard validity constraints from preferences such as
   familiar open shapes, fewer/wider barres, hand stretch and internal mutes.
5. **Transitions:** a later, separate problem chooses compatible shapes for a
   sequence. A comfortable isolated chord need not be the easiest next chord.

JGuitar exposes the first four through its symbol search and calculator. We
should reproduce useful behavior through an independent implementation; we have
not inspected its server code or inferred its exact scoring formula.

Sources:
- [JGuitar calculator](https://jguitar.com/chord?root=C&chord=Major)
- [Radicioni and Lombardo, chord fingering as constraint satisfaction](https://escholarship.org/content/qt7cp5z258/qt7cp5z258.pdf)
- [Radisavljevic and Driessen, static and transition costs](https://www.ece.uvic.ca/~peterd/papers/PDL_paperICMC2004_ver9.PDF)
- [Hori et al., arrangement and fingering sequences](https://www.jstage.jst.go.jp/article/ipsjjip/21/2/21_264/_pdf)

These research models have limited instruments, hand assumptions and evaluation
sets. They support the architecture; they are not universal proofs of playability.

## Important correctness traps

- A chord is not a set of pitch classes alone. `D/F#` requires F# to be the
  lowest **sounding** pitch; merely including it is insufficient.
- `C6/9` uses a slash that does not introduce a bass note.
- Commas inside `C7(b9,#11)` are not separators between two chord searches.
- Enharmonic pitches can share MIDI values but need different labels. Preserve
  interval identity for correct #11/b5 spelling.
- Added ninth and dominant ninth differ: an add9 does not imply a seventh.
- Extended voicings can omit tones in practice. Express required, optional,
  explicitly excluded, and alternative degrees deliberately. Do not require every
  theoretical tone, or allow arbitrary omissions that erase chord quality.
- `alt` expresses choices of alterations, not one universal list of mandatory
  simultaneous notes. Defer or explicitly constrain this symbol initially.
- Barres cannot press a string that must remain open or sound a lower fret.
  Counting distinct frets or fretted strings is not finger assignment.
- A fixed fret span is a useful coarse filter, not a physical difficulty model.
  Frets get closer together up the neck. Finger-pair reach and barre width matter.
- A subset is not automatically the same named chord: C–G alone does not identify
  major versus minor. Keep inherited-chord context explicit.
- Store sounding pitch separately from shape labels/capo-relative positions.
  Define string order explicitly: current exercise code numbers high E as string
  1; backing code also uses low-E-first zero-based string indices.

Sources:
- [University of Puget Sound: jazz chord analysis and incomplete chords](https://musictheory.pugetsound.edu/mt21c/HowToAnalyzeJazzChords.html)
- [MusicXML: chord symbols and diagrams](https://www.w3.org/2021/06/musicxml40/tutorial/chord-symbols-and-diagrams/)
- [StewMac: physical fret spacing](https://www.stewmac.com/video-and-ideas/online-resources/learn-about-guitar-and-instrument-fretting-and-fretwork/fret-scale-rule-instructions/)

## Existing software and direct experiments

All three evaluated npm packages use MIT licenses.

| Component | Observed strengths | Limitations to address |
| --- | --- | --- |
| `@tonaljs/chord` 6.3.1 | TypeScript, chord dictionary, intervals and useful note spelling; handles ordinary symbols, inversions, 6/9 and parenthesized alterations | Raw `get` rejected CΔ7 and Bø7 in this trial; `alt` chooses one concrete formula |
| `chord-symbol` 4.0.0 | Broad notation variants, explicit alterations/omissions and parsing intent | Older published package; documented bundle import needed for direct Node use in this trial; some note spelling and alt semantics require an adapter |
| `@tombatossals/chords-db` 0.5.1 | Existing fret/finger/barre examples with MIDI values; useful fixtures and familiar-shape candidates | Finite standard-tuning database, not a search solver or proof of ergonomics; some unqualified chord entries are inversions |

I ran 14 parser probes; outputs are saved in `parser-comparison.json`.
Both parsed D/F#, C6/9, C7(b9,#11), C13 and explicit no5.
For C7(b9,#11), Tonal spelled the altered eleventh F#, while chord-symbol's notes
array used Gb despite preserving #11 in its intervals. For C7alt, the former
selected #5/#9 and the latter included several alternative alterations. These
are reasons to normalize through our own small, tested contract.

The database audit covered **529 definitions and 2,069 positions**. Every stored
MIDI array matched the fret/tuning calculation. This verifies pitch encoding,
not labels, bass policy, finger assignments or difficulty. Positive fret values
are relative to `baseFret`; zero is an open string. The source README's compact
string order differs from the generated JSON, so importing it blindly is unsafe.

Sources:
- [Tonal chord API](https://github.com/tonaljs/tonal/blob/main/packages/chord/README.md)
- [ChordSymbol documentation](https://github.com/no-chris/chord-symbol/tree/master/packages/chord-symbol)
- [chords-db data and schema](https://github.com/tombatossals/chords-db)

## Recommended first milestone

A shared, pure TypeScript module with no DOM, React, audio, cloud or persistence:

- Typed chord interpretation, search constraints, voicing, fingering and ranking
  records. Preserve requested spelling and exact sounding MIDI per string.
- Use Tonal behind a thin adapter for the initial explicit chord vocabulary;
  regression-test common aliases. Keep the broader parser as a comparison
  reference, not a second production parser.
- A small verified familiar-shape catalog plus deterministic generated candidates.
  Curated shapes are subject to the same pitch, bass and constraint checks.
- Enumerate within bounded hand-position windows. Prune impossible pitch/bass,
  string-count and reach branches early; deduplicate before ranking.
- Conservative finger assignment with optional barres and explicit constraints:
  fret limits, fretted span, finger budget, open strings, internal muted-string
  gaps and string count. Return assessment features, not a universal difficulty
  percentage.
- Rank familiar beginner shapes first by default, with stable tie-breaking.
  Keep generated/curated provenance and explanations visible in returned data.
- JSON/text CLI for inspection, without committing to a graphical layout.

Begin with standard six-string tuning, explicit common chords and slash basses.
Keep tuning represented as input data, but do not claim alternate-tuning/capo
support until it has tests. Defer ambiguous altered-family policies, hand-specific
calibration, contextual rootless comping and progression optimization.

Validation should include standard open chords and F/Bm barres; aliases and malformed
inputs; D/F# bass enforcement; 6/9 versus slash notation; optional fifths; blocked
open strings under barres; octave-equivalent/enharmonic roots; input immutability;
stable rankings; and an independent brute-force oracle for small fret ranges.
Use the existing database as a fixture corpus, checking each datum rather than
assuming it is authoritative. Benchmark complete searches before imposing a result
limit; an arbitrary early cutoff can discard the easiest later-generated shapes.
