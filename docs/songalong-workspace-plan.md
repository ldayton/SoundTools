# SongAlong workspace redesign

Scope: SongAlong first, local only. Keep controller ownership, playback/matching,
URL settings, saved data, score gestures and fixed-width piano keys. Other apps
retain their current presentation while shared components gain optional variants.

## Complete element inventory and intended placement

| Element | Placement and behavior |
| --- | --- |
| Brand/home and panel toggles | Navigation resizes from its 224px minimum, with drag and keyboard controls; panel toggles stay anchored at either end of the top bar, in both expanded and collapsed states |
| Hymn search | Top of left navigation, searchable and keyboard accessible; same mobile navigation drawer |
| Song library | Search songs placeholder, no title or redundant navigation tab; independently scrolling choices |
| MIDI status/green dot, connect/retry/disconnect, input choice, errors | Lower-left Keyboard accordion, separated from the library; hide the whole Input field when no device choice is needed |
| Global volume | Left toolbar zone; icon opens a vertical slider directly below it |
| Settings link/update indicator | Lower left navigation |
| Practice options collapse/reopen | Desktop right inspector, 280px, titled Practice options or Playback options to match the mode; closed initially on mobile, bottom drawer with close/Escape/focus return |
| Wait for me/Playback | Single toggle button in the top bar |
| Key, original preference, disabled keys, full melody range | Key group; range immediately below key; unavailable-key notice remains in score |
| Optional lowest/highest melody note and Clear | Two optional C2–B6 fields within Key group; existing desktop grid/mobile wheel retained |
| Arrangement | Arrangement group; melody, bass, simple chords, broken chords or original harmony |
| Show hands/Practise hands | Paired fields when bass is selected; practice can only target visible hands; practice field only in Wait mode |
| Re-strike tied notes | Checkbox in Wait mode |
| Tempo number, +/-; count-in | Compact numeric BPM field in the centered playback group; always mounted and disabled in Wait for me; count-in in inspector, only in Playback mode |
| Score size | Left toolbar zone beside volume; integrated Aa/value/px number field, staff height 20–80 pixels, shared across songs and saved across reloads |
| Source credits, source link, explanatory details | About this hymn accordion, closed by default |
| Hymn title and basic credits | Centered title plus words/music credits on the white, scrollable score page; generous page padding above and below |
| Progress and errors | No status/progress strip above the score; position remains available to assistive technology. Actual errors remain visible when needed; note coaching remains on the score and piano |
| Go to start and Play/Pause | Centered transport group with the mode and tempo; Go to start changes position while preserving playing/paused state |
| Legacy restore and previous sections | Contextual actions only when applicable; no Next hymn button |
| On-screen piano toggle | Right toolbar zone; icon remains in both modes; black/white keys light sounding notes during Playback, including sustained bass |
| Passage status in bars/beats, cancel/clear, Loop and adjustable endpoint handles | Separate row below the score so controls never move notes during a drag; click/tap to seek; drag score selection and smooth full-height shading retained |
| Notation, lyrics, current/wrong notes, ties and both staves | Score fills central column; scrolling within score, stable renderer host |
| Piano, expected/pressed colors and labels | Docked at the bottom; score scrolls above. Clicks always audition, including during Playback or paused practice, without changing the playhead |
| Offline availability/download/retry/update/progress | Settings route; existing shared panel and service worker behavior |
| Diagnostic sharing | Settings Privacy section, opt-in semantics unchanged |
| Recording credits | Settings link |
| Persistence warning, not-found page, fatal recovery | Existing global messages remain reachable; errors never covered by toolbar |

## Implementation sequence

1. Opt-in compact shared shell and mobile options drawer; SongAlong navigation grouping.
2. Group inspector fields; make mode selection direct; move transport above score and
   keep a separate passage row below the score; expand score space using SongAlong-scoped styles.
3. Exercise desktop 1680x1050 and narrow mobile, keyboard and drawer focus, resizing,
   all mode/arrangement/hand combinations, score/piano/selection, settings/error states.
   Run existing hymn and shared layout regressions. Review screenshots and iterate.
4. Leave local, unpushed, with screenshots and local URL for review.

## Local verification

The local implementation includes the complete inventory above. The compact
shell and drawer behavior are opt-in to SongAlong; other apps keep their current
presentation. Shared numeric toolbar fields use Mantine NumberInput with icons and unit suffixes.
The volume popup uses Mantine Popover and Slider. Sidebar resize uses a keyboard-accessible separator.

Regression checks cover fixed toolbar anchors, live score resizing, song changes
and saved score size, MIDI input gating, drawer focus and geometry, constant piano
key width, hand constraints, playback highlighting and pause, and passage gestures.

Changes remain uncommitted and unpushed. Local preview:
http://127.0.0.1:4321/piano/hymns.

Verified locally: production build/typecheck, 33 unit tests, shared UI controls,
sidebar and layout contracts, every 44 melody/harmony score at four widths,
MIDI/tied-note recovery, playback/count-ins/live tempo, passage gestures and
looping. Focused toolbar, slider, persistence, printed-page and responsive checks
passed in Chromium, Firefox and WebKit.

Latest local regression checks also cover integrated numeric fields, full mode-label
visibility, fixed toolbar geometry across mode switches, six responsive widths,
sidebar drag/keyboard/minimum width, the piano dock, audible clicks without changing
playback position, and the C2–B6 note selectors. These pass in Chromium and WebKit.


Score interaction follow-up: clicks/taps seek without selecting or starting paused audio.
Dragging previews a smooth, fixed-height musical band and commits on release.
Visible endpoint sliders support pointer/touch and keyboard adjustment; double-click
selects the written measure (including pickup handling). Left/Right seek, Shift+arrows
extend the range, and Cmd/Ctrl+Z undo range edits while the score has focus. Escape,
pointer cancellation and focus loss restore the committed passage. Layout changes
recompute geometry without changing musical endpoints. Playback options can reuse
the chosen count-in before each loop; Wait for me never counts in.
