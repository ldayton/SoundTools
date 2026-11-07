# Note by Note

Guitar note recognition in the SoundTools workspace. No audio, microphone, account, or sync.

From the repository root:

- `npm run dev --workspace=notecards` → http://127.0.0.1:4320/
- `npm run build --workspace=notecards`
- `npm test --workspace=notecards`
- `npm run test:browser --workspace=notecards` (original staff regression suite)
- `npm run test:guitar --workspace=notecards` (all five modes)
- `TEST_BROWSER=firefox npm run test:guitar --workspace=notecards` (also `webkit`)

Browser suites start their own built preview. `TEST_BASE_URL` targets an existing server; `TEST_PORT` changes the guitar preview port.

## Practice modes

| Mode | Prompt | Answer |
| --- | --- | --- |
| Name the note | Highlighted fretboard position | Letter plus optional accidental |
| Find the note | Named note and specified string | Any matching pitch class in the selected fret range on that string |
| Read tab | Single tab number on six lines | Letter plus optional accidental |
| Staff to fretboard | Guitar staff note and specified string | Its exact sounding pitch on that string |
| Read staff | Guitar staff note | Letter plus optional accidental |

Fresh profiles start with Read staff in C major. Name the note starts with all six strings, frets 0–5, and all twelve pitches. It has an All notes / Naturals only selector and does not filter by musical key. Other guitar modes start with low E string, frets 0–5. Practice order is Read staff, Name the note, Find the note, Staff to fretboard, Read tab. Existing users retain Read staff and their previous range, key, and progress. All modes remember independent settings and learning history. Find-the-note progress identifies a string and pitch class; octave-equivalent prompts are deduplicated. Other guitar modes track individual string/fret locations. Changing settings starts a fresh session. At least one string remains selected. Empty key/string/fret combinations explain how to recover rather than generating invalid questions.

Rounds contain 12, 24, 36, or 48 exercises (default 12), remembered across modes and visits. Changing the count starts a fresh round. Each question is graded once. Correct answers advance after 450ms; corrections remain for 1.6 seconds. Selection excludes only the immediately previous question, and softly balances recency, coverage, accuracy and delayed mistake revisits. No fixed repeat queue or shuffled-deck order is imposed. Lightweight review spacing across visits uses 1, 3, 7, 14 and 30 days. Practice remains available before a review is due. No mastery claim comes from one successful session; suggestions require repeated accurate answers. Continue resets the round score while retaining recent questions, exposure counts and pending mistake revisits. Changing settings starts a fresh selection context. One-card sets repeat; two-card sets alternate.

Desktop name input: press A–G to answer. First press + for sharp; − for flat; 0 to return to natural. Touch uses modifier buttons, then a letter. Enharmonic equivalents count as correct; no octave is required when naming. Location input supports pointer/touch, focusable frets, left/right navigation and Enter. Held keys and double clicks cannot answer successive cards during feedback.

Fretboard views put high E at the top, low E at the bottom, with a separate open-string column, nut, fret numbers and position markers. Wider ranges use mobile-friendly six-column windows. Staff and tab use bundled VexFlow Bravura fonts, without a font CDN. Standard tuning is fixed; fret range is 0–12. Staff range uses E2–A4 sounding guitar pitches and the octave-down treble clef. Key signatures determine available notes in the notation/key-based modes. Name the note includes every selected fret by default; enharmonic answers remain equivalent.

## Structure

- `model.ts`: musical spelling and existing staff question generation.
- `guitar.ts`: tuning, pitch/location mapping and guitar question generation.
- `session.ts`: question selection, feedback guards and session completion.
- `progress.ts`: validated versioned storage, legacy migration and review history.
- `notation.ts`: staff/tab SVG renderer.
- `fretboard.ts`: fretboard renderer, mobile windows and keyboard navigation.
- `main.ts`: UI coordination.

Storage failures never prevent practice. Background tabs do not advance to additional questions; changes cancel pending feedback timers. Saved history is bounded by the finite card identities; raw answer logs are not stored. The app has no service worker yet.

Vercel deploys the committed main branch as the note-by-note project. Local changes do not deploy until explicitly pushed.
