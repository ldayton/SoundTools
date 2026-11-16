# NoteWise workspace alignment

Local implementation of the six changes carried over from DoReGo and SongAlong.

1. **Toolbar:** universal volume, exercise-specific compact actions and one position counter. Rhythm tempo lives beside its start/stop control. Required answer controls remain in the question area.
2. **Shell:** shared compact, resizable navigation; anchored sidebar buttons; desktop options panel and initially closed mobile drawer. Keyboard connection uses the same Mantine accordion as SongAlong.
3. **Practice:** the exercise heading is part of the scrollable content. Cards share padding, physical staff spacing and a consistent visual-question / feedback / answer arrangement. Essential theory prompts remain visible.
4. **Options:** key restrictions and interval qualities are directly visible. Only explanatory examples and scale-reference details remain expandable.
5. **Piano:** shared fixed-width white/black styling and attack animation, including MIDI held-note state. Optional reference keyboards share one visibility preference; required piano answers remain visible regardless of that preference. Paused patterns still allow note audition without advancing.
6. **Noise:** one toolbar counter replaces duplicate card counters and progress bars; session utilities use labelled icon buttons. Letter answers and rhythm tapping retain generous targets.

## Ownership and responsive behavior

- Each retained activity owns a React portal into its own toolbar host. The shell attaches only the current host, preserving suspended exercises and avoiding duplicated controls.
- The options form has a single portal host moved between the desktop aside and mobile drawer. This preserves React state, pitch-picker identity and draft inputs across breakpoints.
- Phone transport occupies the complete second toolbar row, including at 320 px; sidebar buttons remain in fixed first-row slots.
- SongAlong continues to use its existing music-player toolbar and score layout.

## Checks

`npm run test:workspace --workspace=notewise` covers all twelve NoteWise modules, toolbar ownership, answers/counters, mandatory piano availability, physical key width, modal input gating, mobile fit, rhythm tempo and MIDI press/release animation. It runs in each browser in the existing CI matrix.

Existing navigation, theory, rhythm, piano, fretboard, audio, recovery and shared-layout checks have been updated for the new control locations. The shared UI fixture now uses DoReGo's current view/toolbar interface.

Pitch pickers put their popover inside a containing modal, preserving nested focus trapping. The picker consumes Escape before the options drawer; its keyboard grid receives focus after becoming visible. Tests wait for the normal drawer transition before sending keyboard input.

Local verification: all 135 shared practice unit tests passed; the new workspace contract passed in Chromium, Firefox and WebKit, including nested picker keyboard navigation and 320 px toolbar fit. Existing flashcard, theory, rhythm, guitar, piano, notation, recovery, audio and offline checks were exercised. All three practice apps build, and their shared layout checks passed. The local Chrome app was also checked by hand. Nothing has been pushed.
