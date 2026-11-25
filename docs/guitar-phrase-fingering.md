# Guitar phrase fingerings

`packages/music-practice/src/guitar-phrase-fingering.ts` owns fretting-hand
suggestions for fixed tablature. The score adapter and legacy melody API both
call it. Guitar engraving no longer chooses fingers from song-specific tables
or a pitch-to-finger map. Piano editorial fingerings are unchanged. Static chord
search still owns string/voicing feasibility and capo suggestions; those choices
are inputs to the phrase planner, not instructions about a finger at every attack.

The input contains identified notes with absolute start/duration in quarter-note
beats, string (1 = high E), fret relative to capo, and optional tie predecessor.
The planner merges ties and creates a frame at every attack and release, including
rests. Each frame enumerates the legal complete hand grips and positions. The
existing shared chord feasibility checker rejects conflicting fingers, excessive
reach and barres crossing open, explicitly muted or lower-fretted strings.
Null contacts in a timed phrase are unplayed strings; barres may cross those
gaps without creating extra sounding notes. Static chord search retains its
conservative muted-string policy unless unplayed strings are explicitly supplied.
A finger can extend one fret from its nominal position. Unsupported fixed-tab passages return null;
the renderer omits suggestions instead of printing a partial or impossible hand.

A shortest-path search evaluates all candidate states, with no beam pruning.
Held contacts keep their fingers by default. Optional substitutions have an
explicit penalty. The cost combines position, physical stretch (650 mm scale
by default, adjusted for capo), barre width, finger travel, hand shifts and
repeated-note finger changes. Duration weights grip effort; tempo affects
transition time. Rests release contacts while retaining hand position. Unoccupied
finger trajectories are not modeled: this is a conservative, tunable ergonomic
model, not an anatomical guarantee. Weights are heuristics, not learned parameters.

The result retains each note occurrence, the complete hand-state path, and a
cost breakdown both per transition/frame and for the whole phrase. This allows
ranking reviewed alternatives without making every test require one exact answer.
The score adapter includes hidden voices so display options cannot erase held
constraints. Source music, pitches, rhythm, strings and frets are not rewritten.

Regression owners:

- `packages/music-practice/tests/guitar-phrase-fingering.test.ts`: comfort rankings,
  holds/ties, repeated notes, barres, rests, substitutions, invalid input, cost
  accounting and an independent exhaustive short-path oracle.
- `packages/music-practice/tests/guitar-score-fingering.test.ts`: multi-voice timing,
  ties across systems and complete plans for every registered instrument edition.
- `apps/songalong/tests/guitar-fingering.test.ts`: compatibility melody API.
- `apps/songalong/tests/guitar.browser.ts`: CI browser witness of planner contacts.
- `apps/songalong/tests/guitar-fingering.browser.ts`: Nightly edition-wide browser
  witness, with existing unchanged-tab and fingering-toggle checks.

The unit files are enrolled by the existing shared music glob. Browser ownership
uses existing CI/Nightly entries in `scripts/ci/test-strategy.cjs`; no new lane or
convenience-alias expansion is needed.

During integration, the Nightly guitar witness exposed two identical tab fermatas
on mobile: both source voices were copied to the same destination. Tab rendering
now merges identical destination marks. The first failure is retained in
`work/ci-results/1795641259086-4fdcb6ed` (guitar-fingering browser, strict selector
matching two symbols); source-voice diagnosis is in
`work/ci-results/1795641422010-466a32b0`. The browser contract still requires one
visible symbol, with no retry or relaxed assertion.

## External regression cases

The MIT-licensed `tombatossals/chords-db` fixture lives in
`packages/music-practice/test-fixtures/external/chords-db`, with its upstream
license, revision and conversion notes. Sixteen reviewed shapes test finger
assignments as acceptable candidates, absolute fret/pitch agreement, barre
metadata, complete phrase coverage and candidate uniqueness. These inexpensive
checks are enrolled by the existing shared music CI unit glob.

The initial imported cases exposed three rejected grips (C6, F6 and Cmaj9): an
unplayed string was incorrectly treated as an obligatory left-hand mute. The
shared validator now takes explicit unplayed-string context, used by the phrase
planner at each attack/release. A continuation regression checks that an open
string sounding later still rules out a conflicting initial barre while the
other notes are held. Existing strict muted/open/lower-string assertions remain.

The complete upstream database is a diagnostic corpus, not unquestioned ground
truth. Some records have invalid finger labels; some valid advanced grips exceed
our conservative one-fret extension model. In particular, stacked-finger grips
near the nut still require ergonomic review before broadening that model.

## External phrase and failure fixtures

Two further FOSS sources are retained under `test-fixtures/external`:

- `musicxml-suite`: MIT, source revision and full license in its NOTICE/LICENSE.
  Two standard-tuning guitar parts from the original `71e-TabStaves.musicxml`
  provide chords, a rest, opens and large position changes. The original XML is
  retained alongside the translated timed-note fixture. Tests independently
  check sounding pitches, multiplicities, concurrent contacts and rest timing.
  Time translation, tied segmentation and input reordering additionally test
  that representation changes cannot change the hand plan or its cost.
- `guitar-tab-generator`: GPL-3.0-only, full license and verbatim minimized
  failure seeds retained. The three distinct duplicate-pitch regressions and all
  thirteen distinct-string chord candidates from its worked G3/rest/B3/D4+G4
  example are adapted to our fixed-tab API. The test adapter retains GPL marking.
  Same-string conflicts remain impossible; distinct-string unisons retain their
  separate note identities. Expected feasibility flags describe our conservative
  hand model, not the upstream program's output or a human fingering assessment.

`guitar-external-phrases.test.ts` and `guitar-upstream-regressions.test.ts` are
required through the existing shared music unit glob in CI and Nightly. The
upstream data supplies phrase/representation witnesses rather than expert finger
number ground truth. No product arrangement or production exception was added.
