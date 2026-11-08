# Note by Note

Note recognition and key-signature practice in the SoundTools workspace. No audio, microphone, account, or sync.

From the repository root:

- `npm run dev --workspace=notecards` → http://127.0.0.1:4320/
- `npm run build --workspace=notecards`
- `npm test --workspace=notecards`
- `npm run test:browser --workspace=notecards` (original staff regression suite)
- `npm run test:guitar --workspace=notecards` (all five modes)
- `npm run test:midi --workspace=notecards` (simulated MIDI input and connection lifecycle)
- `npm run test:piano --workspace=notecards` (responsive piano answers)
- `npm run test:signatures --workspace=notecards` (all 30 major/minor answers)
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
| Find on piano | Staff note or note name | Piano key; exact octave for staff prompts |
| Read key signatures | Key signature, with Major key / Minor key prompt | Correctly spelled tonic letter plus optional accidental |

Fresh profiles start with Read staff in C major. Name the note starts with all six strings, frets 0–5, and all twelve pitches. It has an All notes / Naturals only selector and does not filter by musical key. Other guitar modes start with low E string, frets 0–5. Practice order is Read staff, Name the note, Find the note, Staff to fretboard, Read tab, Find on piano, Read key signatures. Existing users retain Read staff and their previous range, key, and progress. All modes remember independent settings and learning history. Find-the-note progress identifies a string and pitch class; octave-equivalent prompts are deduplicated. Other guitar modes track individual string/fret locations. Changing settings starts a fresh session. At least one string remains selected. Empty key/string/fret combinations explain how to recover rather than generating invalid questions.

Piano practice defaults to C4–B5 on an ordinary treble clef, with exact-octave grading. Note-name prompts use a single C–B octave and grade pitch class. The stable, unlabeled HTML keyboard is continuous on desktop and splits into two rows at natural gaps on mobile, without scrolling. Range controls allow at most fourteen diatonic positions; enharmonic boundary keys remain reachable.

Piano mode also accepts Web MIDI input. Connect the keyboard's USB COMPUTER port with a data-capable cable, open the app in desktop Chrome, and choose **Connect MIDI keyboard**. Access is requested only by that action, without SysEx or software synth access; no MIDI output or audio recording is used. A GO:KEYS input is preferred automatically; multiple other inputs require a selection. The app handles hotplug/replug, permission denial/revocation, input changes and cancellation. Held notes/chords latch until all keys are released, and feedback, hidden or unfocused pages, other practice modes and finished rounds do not accept answers. Each new question rejects older queued MIDI messages. MIDI note data, velocity, port IDs and device names are not persisted or included in diagnostics; opted-in diagnostics report only a categorical connection state. Reconnect manually after reload. MIDI input also works with the installed offline copy in a supported browser; Safari falls back to the on-screen keys. Simulated browser tests exercise the protocol and UI; a real Roland/device test still requires the keyboard to be connected.

Key-signature practice defaults to Major only, followed by Minor only and Major & minor options. All fifteen conventional signatures are engraved with VexFlow; C major / A minor has no accidentals. Every card explicitly asks for the major or minor tonic because relative keys share a signature. Major and minor cards have separate review history. No individual key selector or note-range controls are shown in this mode.

Rounds contain 12, 24, 36, or 48 exercises (default 12), remembered across modes and visits. Changing the count starts a fresh round. Each question is graded once. Correct answers advance after 450ms; corrections remain for 1.6 seconds. Selection excludes only the immediately previous question, and softly balances recency, coverage, accuracy and delayed mistake revisits. No fixed repeat queue or shuffled-deck order is imposed. Lightweight review spacing across visits uses 1, 3, 7, 14 and 30 days. Practice remains available before a review is due. No mastery claim comes from one successful session; suggestions require repeated accurate answers. Continue resets the round score while retaining recent questions, exposure counts and pending mistake revisits. Changing settings starts a fresh selection context. One-card sets repeat; two-card sets alternate.

Desktop name input: press A–G to answer. First press + for sharp; − for flat; 0 to return to natural. Touch uses modifier buttons, then a letter. Enharmonic equivalents count as correct for note naming; no octave is required. Key-signature answers require the written key name (D♭ major and C♯ major have different signatures). Location input supports pointer/touch, focusable frets, left/right navigation and Enter. Held keys and double clicks cannot answer successive cards during feedback.

Fretboard views put high E at the top, low E at the bottom, with a separate open-string column, nut, fret numbers and position markers. The diagram always starts at Open and includes frets 1–5, extending to the highest selected fret when needed. Narrow practice ranges do not shrink the diagram; out-of-range answers are disabled. Wide diagrams scroll horizontally on mobile, with large touch targets. Staff and tab use bundled VexFlow Bravura fonts, without a font CDN. Standard tuning is fixed; fret range is 0–12. Staff range uses E2–A4 sounding guitar pitches and the octave-down treble clef. Key signatures determine available notes in the notation/key-based modes. Name the note includes every selected fret by default; enharmonic answers remain equivalent.

## Structure

- `model.ts`: musical spelling and existing staff question generation.
- `guitar.ts`: tuning, pitch/location mapping and guitar question generation.
- `session.ts`: question selection, feedback guards and session completion.
- `progress.ts`: validated versioned storage, legacy migration and review history.
- `notation.ts`: staff/tab/key-signature SVG renderer.
- `midi-input.ts` / `midi-panel.ts`: permission-gated MIDI input, gesture guards and connection UI.
- `piano-model.ts` / `piano.ts`: piano decks, grading and responsive keyboard.
- `key-signatures.ts`: major/relative minor question generation and spelling-aware grading.
- `fretboard.ts`: fretboard renderer, anchored axis, horizontal scrolling and keyboard navigation.
- `main.ts`: UI coordination.

Storage failures never prevent practice. Background tabs do not advance to additional questions; changes cancel pending feedback timers. Saved history is bounded by the finite card identities; raw answer logs are not stored. Built releases save a verified offline copy automatically; development mode does not register a service worker.

Vercel deploys the committed main branch as the note-by-note project. Local changes do not deploy until explicitly pushed.

## Offline use and updates

After one completed connected visit, the full app (including notation fonts and icons) is saved automatically. The bottom “Take it with you” section confirms “Available offline”; failed storage or network setup offers a retry. Practice and saved settings work without a connection. Browser eviction can remove the offline copy; a connected visit repairs it. A first-ever offline visit cannot load an app that has never been saved.

The app uses the shared `@ldayton/browser-offline` runtime for cached-first startup, bounded network/storage operations, SHA-256 verification, serialized release staging, and live-tab protection. Each build has a content-derived generation and complete inventory. An incomplete release cannot replace a verified one. Corrupt or missing files fall back to a complete older copy where available. Offline failures never block a working online practice session.

A verified update applies automatically only before interaction. After any interaction, “Update available” lets the user apply it explicitly; worker replacement never resets a round. Old tabs keep their generation's assets. Update checks run on reconnect, foreground return, and periodically while visible. Stable worker and inventory URLs require revalidation; hashed assets retain immutable caching.

Run `npm run build --workspace=notecards`, then `npm run test:offline --workspace=notecards` (or set `TEST_BROWSER=firefox` / `webkit`). The real-worker suite serves two actual builds and exercises offline grading, cached startup under a stalled network, active and untouched update policies, old tabs, corruption fallback and repair, eviction, and incomplete first-install retries. Local offline review requires the built preview rather than Vite's development server.

## Diagnostic sharing

The unchecked “Share diagnostic information” checkbox uses the shared SoundTools collector. Only opted-in, configured production sessions send sanitized technical errors, usage counts, and performance/offline measurements to Sentry. No card contents, typed answers, local practice history, or personal text are uploaded. Preview/development builds do not send. Run `npm run test:diagnostics --workspace=notecards` for the real-SDK test using intercepted fake ingestion requests. Production deployment runs the shared source-map publisher; see `docs/observability.md` for environment variables and consent/queue behavior.
