# Note by Note

Local guitar note recognition in the SoundTools workspace.

Run `npm run dev --workspace=notecards` from the repository root and open
http://127.0.0.1:4320/. Build with `npm run build --workspace=notecards`.

Twelve-card sessions use A–G plus an optional modifier, with no octave required. A single-choice major-key selector starts in C major.
The signature is drawn on the staff and each card belongs to that key. Select sharp with + or flat with − before pressing the
letter, which submits. Escape or 0 resets to natural. Touch controls use the same
modifier-first interaction. Held keys cannot submit multiple answers.
Enharmonic equivalents count as correct. A mistake displays the written answer
for 1.6 seconds before advancing; correct answers advance after 450ms. Background
tabs do not consume further cards. Each session can be continued with another 12.

The clef has an octave-down 8: range labels are sounding pitches, and the staff renders one octave higher. The default range is E3–F4. Lowest/highest selectors span E2–A4; E2 is one octave below the bottom staff line (sounding E3). Single-note ranges are allowed. The selected key determines sharps/flats; no extra chromatic accidentals are added. Selection balances coverage with weaker cards,
excluding the previous three questions. This is adaptive drill practice, not a
calendar-based spaced repetition scheduler. Progress/settings are validated and
saved locally; unavailable storage does not prevent practice. No audio or sync.

VexFlow's Bravura entry bundles notation fonts. There are no runtime font CDNs.
Vercel deploys this workspace from main as the note-by-note project. The app has no service worker yet.

`npm test --workspace=notecards` tests card generation, equivalence, selection,
and storage validation. After building,
`npm run test:browser --workspace=notecards` starts its own preview server and exercises desktop and mobile input,
a full session, continuation, persistence, and visual captures.
