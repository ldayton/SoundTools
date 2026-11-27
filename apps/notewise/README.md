# NoteWise

Note recognition and key-signature practice in the SoundTools workspace. Piano sound and MIDI are supported; no account or sync. Hymn practice lives in SongAlong.

From the repository root:

- `npm run dev --workspace=notewise` → http://127.0.0.1:4320/
- `npm run build --workspace=notewise`
- `npm test --workspace=notewise`
- `npm run test:browser --workspace=notewise` (original staff regression suite)
- `npm run test:guitar --workspace=notewise` (all five modes)
- `npm run test:midi --workspace=notewise` (simulated MIDI input and connection lifecycle)
- `npm run test:piano --workspace=notewise` (responsive piano answers)
- `npm run test:notation --workspace=notewise` (clef anchors, all layouts, octave signs and stable responsive frames)
- `npm run test:signatures --workspace=notewise` (all 30 major/minor answers)
- `TEST_BROWSER=firefox npm run test:guitar --workspace=notewise` (also `webkit`)

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

Fresh profiles start with Read staff in C major. Name the note starts with all six strings, frets 0–5, and all twelve pitches. It has an All notes / Naturals only selector and does not filter by musical key. Other guitar modes start with low E string, frets 0–5. Navigation groups exercises under Piano, Guitar, Rhythm, and Music theory. Each exercise has its own bookmarkable route; Settings contains offline and privacy controls. Existing users retain Read staff and their previous range, key, and progress. All modes remember independent settings and learning history. Find-the-note progress identifies a string and pitch class; octave-equivalent prompts are deduplicated. Other guitar modes track individual string/fret locations. Changing settings starts a fresh session. At least one string remains selected. Empty key/string/fret combinations explain how to recover rather than generating invalid questions.

Piano practice defaults to C4–B5 on a grand staff, with standard placement, octave markings off, and exact-octave grading. Existing saved piano profiles migrate to Treble to preserve their previous notation; ranges and sounding-note review history remain intact. Note-name prompts use a single C–B octave and grade pitch class. The stable, unlabeled HTML keyboard is continuous on desktop and splits into two rows at natural gaps on mobile, without scrolling. Range controls use a DoReGo-style octave-grid picker with arrow-key navigation and support C2–B6 without a two-octave restriction. Range endpoints are staff positions; the selected key signature supplies accidentals. Existing settings are preserved. The on-screen keyboard remains compact: extended ranges use C4–B5. A range notice explains MIDI-only notes, and each prompt outside the displayed keys is explicitly marked “MIDI keyboard required” with on-screen answers disabled. Narrower supported ranges retain their existing compact keyboard and enharmonic boundary keys.

When **Show → Staff** is selected, **Staff layout** offers Treble, Bass, and Grand staff. Grand staff always displays both staves with one question note. **Overlapping notes** appears only for grand staff: Standard placement uses bass below middle C and treble from middle C; Practice both clefs occasionally uses the alternate clef for B3–D4. **Octave markings → Practice 8va/8vb** mixes unmarked notes with 8va at C6 and above or 8vb at B2 and below. An 8va note sounds one octave above its written position; 8vb sounds one octave below. Grading, pitch range, MIDI-only notices and history always use the sounding pitch. Staff lines and frame bounds stay fixed within each layout, including octave brackets; bass top line is A3 and middle C is the first ledger above bass or below treble. Notation options are hidden for Note name prompts but retained for later staff practice.

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

After one completed connected visit, the full app (including notation fonts and icons) is saved automatically. The Settings page’s “Take it with you” section confirms “Available offline”; failed storage or network setup offers a retry. Practice and saved settings work without a connection. Browser eviction can remove the offline copy; a connected visit repairs it. A first-ever offline visit cannot load an app that has never been saved.

The app uses the shared `@ldayton/browser-offline` runtime for cached-first startup, bounded network/storage operations, SHA-256 verification, serialized release staging, and live-tab protection. Each build has a content-derived generation and complete inventory. An incomplete release cannot replace a verified one. Corrupt or missing files fall back to a complete older copy where available. Offline failures never block a working online practice session.

A verified update applies automatically only before interaction. After any interaction, “Complete update” in the dedicated, centered header toolbar lets the user apply it explicitly; worker replacement never resets a round. Old tabs keep their generation's assets. Update checks run on reconnect, foreground return, and periodically while visible. Stable worker and inventory URLs require revalidation; hashed assets retain immutable caching.

Run `npm run build --workspace=notewise`, then `npm run test:offline --workspace=notewise` (or set `TEST_BROWSER=firefox` / `webkit`). The real-worker suite serves two actual builds and exercises offline grading, cached startup under a stalled network, active and untouched update policies, old tabs, corruption fallback and repair, eviction, and incomplete first-install retries. Local offline review requires the built preview rather than Vite's development server.

## Diagnostic sharing

The unchecked “Share diagnostic information” checkbox uses the shared SoundTools collector. Only opted-in, configured production sessions send sanitized technical errors, usage counts, and performance/offline measurements to Sentry. No card contents, typed answers, local practice history, or personal text are uploaded. Preview/development builds do not send. Run `npm run test:diagnostics --workspace=notewise` for the real-SDK test using intercepted fake ingestion requests. Production deployment runs the shared source-map publisher; see `docs/observability.md` for environment variables and consent/queue behavior.


## Code ownership

- `exercise-catalog.ts` is the data-only source for exercise identities, navigation groups, paths, and activity kinds. The offline build reads it too. `exercises.ts` adds an exhaustive, typed mapping of browser-only factories so build tooling never imports browser dependencies.
- `app-shell.ts` owns navigation, page visibility, focus, and the keyboard connection popover. `navigation.ts` parses distinct exercise/settings/not-found routes. The shell does not own practice state.
- `activity-host.ts` owns live-controller loading and activation. A navigation generation prevents delayed imports from activating a stale exercise. Controllers implement `enter`, `leave`, `interrupt`, and an explicit input policy: none, answering, or hands-free restart only.
- `flashcard-sessions.ts` owns suspended rounds. Exercise settings invalidate that exercise; the shared round length invalidates all. A session's own status is authoritative when restoring it.
- `exercise-settings.ts` validates flashcard settings; live activities own their typed settings validators. Saved-data migrations supply defaults and then use the same validators as URL overrides. Invalid overrides preserve existing values. `persistence.ts` owns durable IndexedDB storage, legacy migration, and coordination between windows without deciding exercise defaults.
- `flashcard-view.ts` and the live views use `practice-controls.ts`. Shared control rules live in `styles/controls.css`; feature layout stays in `style.css`. Shared sequence styles use `sequence-*` names.

To add a live exercise, add its catalog entry and typed factory, then implement its controller and settings validator. Use the shared options/score/input components where appropriate. The deployment-route test checks that every catalog route scope is served by Vercel; offline route scopes are derived automatically. Preserve durable checkpoints and migrate legacy preference keys without discarding their original values.

`npm run test:navigation --workspace=notewise` covers routes, independent rounds, settings, MIDI continuity, mobile controls, and delayed imports. `npm test --workspace=notewise` includes settings/migration and session-ownership regressions.

## Guitar scale explorer

**Guitar → Scales** (`/guitar/scales`) defaults to **CAGED**, with high E at the top, low E at the bottom, and frets increasing to the right. Practice options offers any of 12 tonics, major/natural minor, pentatonic and blues views, plus CAGED regions and a fret-range map; it docks beside the diagram on desktop and collapses above it on phones. In the fret-range map, gray fifth-fret notes have an exact same-pitch, same-octave alternative on the adjacent higher open string. G-string fret 5 and high-E fret 5 are never marked optional. An expandable note table provides sounding octaves and open-string alternatives.

This reference view has no grading or MIDI input. Its `guitar-scales` activity uses the shared activity host, durable storage, route catalog and control styles, independently of Music theory → Scales & degrees. Old local-preview `profiles.scales` preferences migrate into the new activity while retaining their original data. Optional `?key=F%23&scale=minor` URL parameters use the same settings validator. `npm run test:guitar-scales --workspace=notewise` checks navigation, all 24 keys, layout, reload, independent activity progress and MIDI isolation.

**Link with → All five shapes** (`?link=all`) shows one continuous root-to-root
route through the five lowest neighbouring CAGED positions. A line connects the
played notes; four numbered arrows show same-string hand shifts. The shift list
uses the same computed route and can pan/focus each transition. **Reverse route**
shows the exact notes and fingerings in reverse order. Phone diagrams pan inside
the canvas at readable dot size, without changing the selected key. The selection
persists with the scale activity and is shared by the normal account records.
Berklee and Maqamat retain their existing position views.

The pure route owner is `packages/music-practice/src/caged-route.ts`; its unit
witness covers all 72 Western key/scale combinations, pitch continuity, chart
fingerings, all five regions, and reverse symmetry. The existing CI browser owner
`tests/scale-fret-range.browser.ts` covers selection, bookmarks/reload, four shifts,
reverse order, phone/desktop bounds, readable dots, and transition navigation.

### Guitar maqamat

The scale selector includes a **Maqamat** group: Hijaz, Kurd, Nahawand,
Ajam, Nikriz and Hijazkar. These use fingered five-fret hand positions across
all six strings, rather than CAGED chord labels or relative-major/minor links.
Hand position, note/finger labels, key, and the chosen maqam survive reloads
and shareable URLs. Fingerings use fingers 1–4, with at most a one-fret
extension between adjacent fingers; the five-fret window keeps intervening
scale pitches available at string changes.

The collections are equal-tempered guitar reference forms. Hijaz uses
Nahawand on degree 4; Nahawand uses Hijaz on degree 5 (raised seventh).
The visible reference text identifies upper-jins alternatives, and each
maqam links to its [MaqamWorld source](https://www.maqamworld.com/en/maqam.php).
Fret diagrams do not encode traditional intonation, sayr, or modulation.
Backing accompaniment uses only tonic and fifth, preserving the chosen
rhythmic style without imposing major/minor chord progressions.

`npm run test:maqamat --workspace notewise` checks diagrams, fingering labels,
responsive layouts, URLs, persistence and keyboard controls. It is required
in the Nightly Notewise group; music, pitch and fingering unit tests remain
in CI.

### Berklee 7PS conventions

The seven major regions follow [Jens Larsen's published Berklee/Leavitt-variant chart](https://jenslarsen.nl/major-scale-7-positions-berklee-system/), **top to bottom**. In C major, Shapes 1–7 begin on F, G, A, B, C, D and E; these chart indices are not scale degrees. Numbering stays fixed when transposing. The existing independently reviewed seven-diagram golden checks every fret and the numbered starting pitches; its source-image hash identifies the reviewed chart.

Natural minor re-roots the relative-major regions, preserving their numbers and coordinates. Major/minor pentatonic views keep only their scale tones in those regions and show omitted parent notes as hollow dots. Blues views add every blue-note pitch between the pentatonic endpoints, using a neighbouring location and, where needed, a one-fret extension. These subset/blue-note views are NoteWise derivations, not separately published seven-box pentatonic/blues fingerings. [Berklee's pentatonic discussion](https://blogs.berklee.edu/2021/04/string-theory-by-robin-stone/) documents deriving major pentatonic by omitting degrees 4 and 7. The app supplies note labels, not invented finger assignments.

CAGED is the default for unset Western scale preferences. Explicit Berklee selections, saved CAGED choices, fret ranges and old numbered CAGED links retain their meaning. New links use `set=berklee`; `set=hila` and the stored `hilaShape`/`shapeSet: hila` keys remain compatible. Maqamat retain their separate hand-position model. The existing `test:hila-shapes` Nightly command owns the renamed UI, every scale-family selector, published numbering, defaults, legacy links, relative-root restoration and desktop/mobile checks; exhaustive pitches and all 12-key/seven-region combinations stay in inexpensive shared unit tests.

### CAGED scale conventions

The five movable regions are named for their chord forms (C, A, G, E, D),
not for their sounding keys. **GuitarScale.org is the single external reference
for these Western scale regions.** Its diagrams use numbered shapes; NoteWise
identifies their CAGED names from the embedded tonic chord. The publisher does
not supply those letter labels. Berklee 7PS and the maqamat above have their
own references and remain outside this CAGED reference agreement.

Major and natural-minor diagrams include every scale pitch between their
lowest and highest sounding notes. Positions and fingers follow the five
[C-major](https://www.guitarscale.org/c-major.html) and five
[A-minor](https://www.guitarscale.org/a-minor.html) charts; the C-form major
D-string row includes the fourth degree (F4 at fret 15 in C major).

Pentatonics use the conventional two-notes-per-string boxes from
[GuitarScale.org's A minor pentatonic charts](https://www.guitarscale.org/a-pentatonic-minor.html),
with the corresponding relative-major root mapping. They have their own
fingerings; they are not made by deleting dots from a seven-note fingering.
Hollow context notes show omitted degrees within the displayed box's fret
window. The five [A-blues charts](https://www.guitarscale.org/a-blues.html)
specify positions and roots, but not fingers. NoteWise adapts pentatonic
fingerings to add those blue notes: a spare finger is preferred, with a one-fret
slide where necessary. The source's open-position fourth blues box is moved
up one octave to keep the movable region consistent with its pentatonic box.

The five C-major pentatonic and major-blues regions re-root the corresponding
A-minor regions without changing their coordinates. These are derived regions,
not five independently published major diagrams. The publisher's
[major-pentatonic page](https://www.guitarscale.org/c-pentatonic-major.html)
gives the major formula and example positions; its
[C-blues page](https://www.guitarscale.org/c-blues.html) gives the major-blues
formula (C D E♭ E G A) under **Related scales**. That page's main diagram is
minor blues. Other keys transpose these reference regions with key-appropriate
note spelling; the diagrams are not separate transcriptions of every key page.

The relative-scale button changes the actual tonic, root markers, chord and
backing key, and restores the previous scale/position even after reload.
At a neck boundary the corresponding region may need an octave shift.
The chord panel shows the sounding chord at exactly the outlined frets, named
with its CAGED form (for example, “C major · E shape”). The Cm-form outline uses
a playable four-note fragment: the fifth note fits the scale region but would
require an extra fretting finger in the simultaneous grip. Chord outlines and
blues fingerings are explicit NoteWise adaptations, not published chart fingers.

**Show chord shape** on the legend row expands the chord panel and reveals its
connecting lines and dotted chord-note outlines on the scale. **Hide chord
shape** or the panel close button hides both. Chord markings start collapsed.
The chord panel opens with the same orientation as the scale: high E at the top,
low E at the bottom, frets increasing to the right. Rotate offers a conventional
upright chord chart; reopening restores the scale orientation. Finger numbers
describe the simultaneous chord grip, independently of scale-note fingers.
Connected bars identify one finger holding several strings.
The ten reviewed major/minor grips own their frets, fingers and barres together;
barres are never guessed from repeated fret numbers in an arbitrary passage. A purple
line connects the chord notes in both the panel and the scale, with separate
contours for linked shapes. White dotted chord-note outlines retain the root
colors and stay visible against dark root dots.

`packages/music-practice/tests/fixtures/caged-reference.json` records an
independent transcription of all 20 source charts, reviewed on 2026-11-23,
including the 15 charts with published fingers. Source URLs and image hashes
identify the reviewed material without making tests depend on live downloads.
`caged-reference.test.ts` checks every coordinate, root, published finger and
the ten derived major regions. When updating a region, review the source chart
independently; never regenerate expected coordinates from production tables.
These complete reference checks replace the former partial row/box goldens.

Independent unit checks own full-register pitch completeness, published box
coordinates, all-key relative/return behavior and playable linked routes.
Browser checks own the selected tonic/root/URL, durable return, popup-to-outline
agreement, conventional-box rendering and responsive controls. Old assertions
requiring exact deletion of full-scale coordinates/fingers were retired with
that product convention; fixed counts of generated shift routes were replaced
by coverage of every scale/key/shape plus the existing per-route musical checks.
