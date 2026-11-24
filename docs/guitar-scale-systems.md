# Guitar scale systems

CAGED is the default five-region system; Berklee 7PS remains available. Both
support major, natural minor, major/minor pentatonic and major/minor blues,
finger numbers, tonic chord diagrams, relative-scale switching, and linked
regions with selectable shifts, reversal and keyboard navigation.
For both systems, ↓ advances the numbered shape (1 → 2), and ↑ reverses it.
Navigation stops at each end of the selector: 1–7 for Berklee and C–A–G–E–D
for CAGED. Linked shapes move together and stop if either would cross an end.
Use the octave shortcuts explicitly to move a pattern by twelve frets.

Berklee numbering follows [Jens Larsen's published chart](https://jenslarsen.nl/major-scale-7-positions-berklee-system/)
top to bottom. In C major, regions 1–7 begin F, G, A, B, C, D, E. These numbers
are neither scale degrees nor fret positions. Natural minor uses the same
relative-major regions; pentatonics filter their parent, and blues add each
intervening blue pitch. These extensions are app adaptations.

Larsen publishes note locations, not finger numbers or chord grips. The app
assigns fingers using [Berklee position playing](https://online.berklee.edu/takenote/how-to-start-learning-your-guitar-scales/):
one finger per core fret, with index/pinky extensions. Pentatonic subsets retain
parent fingers; blues use a spare finger or an adjacent one-fret slide. Chord
diagrams use independently fingered, compact tonic triads inside each region;
scale finger numbers describe a melodic run, not a simultaneously held chord.
A region may share its tonic grip with a neighbouring region.

CAGED retains its [GuitarScale.org](https://www.guitarscale.org/) reference and
five chord-form names. Do not give the seven Berklee regions CAGED form names
or expand CAGED's five-value `ScalePattern` type to fit them. Legacy `set=hila`
URLs and saved `hilaShape` identifiers remain compatible; new links use
`set=berklee`.

Regression ownership:

- **CI:** `hila-scale-shapes.test.ts` independently preserves all 119 published
  note coordinates and family formulas. `berklee-parity.test.ts` checks all
  seven regions, twelve keys and six families for finger feasibility, complete
  tonic triads, real barres, exact overlay coordinates and consecutive linked
  runs. Keep broad combinations here.
- **Nightly:** `hila-scale-shapes.browser.ts` owns controls, labels, chord
  expansion/collapse, linked selection/reversal/reload and desktop/phone wiring
  in Chromium and WebKit, through the existing NoteWise guitar suite. CAGED's
  source goldens and browser owners remain required.

Shared rendering and shift-route validation serve both systems. Never invent a
route when regions do not overlap at the playable octave, and never use scale
finger numbers as a held chord grip. Add regression cases at the owning layer;
do not repeat the model's full combination matrix in a browser.
