# Tagalujah

A service reader using the SoundTools application shell, practice workspace,
number controls, settings, privacy and offline lifecycle. Run `npm run dev
--workspace=tagaluya` (port 4330), or `npm run build --workspace=tagaluya`.

The initial hardcoded service is November 28, 2026. `src/services.ts` keeps the
provided song order, sections and repetitions. English originals display once;
Tagalog originals have a phrase-aligned English reading translation. The welcome
song includes both verses and the chorus from the supplied lyric image. Jesus, You Are Glorious uses the supplied Robert Gay lyrics.
The Andy Evans PDF is a different song and is excluded. Copied recommendation
links and advertisements are excluded.

No supplied source contains verified staff notation. Melody mode is available
only when every phrase has real ABC underlay; it does not invent tunes. The
browser capability fixture exercises this view with a shared generic hymn.
`BilingualMelody` delegates engraving to the existing shared score layout and
shows the opening clef once. Translation remains readable text under each phrase.

Services use the left navigation; songs use the shared right options drawer.
Horizontal swipes move to adjacent songs without wrapping, while vertical
scrolling remains native. Preferences are versioned local storage; service/song
URLs and offline routes use `/services/:service/:song`.

Gesture recognition and the shell offline controller live in
`packages/browser-controls`, also used by the existing practice apps. The Vercel project is `tagalujah`, using the standard staged release flow.
Production is https://tagalujah.lilydayton.me. The `tagalujah` project in Sentry
uses the shared opt-in diagnostics adapter and production-only source-map uploads.

The song-ending ornament is GDJ's **Flourish Divider**
(Openclipart ID 308072), released under CC0 1.0 / public domain.
Source: https://openclipart.org/detail/308072/flourish-divider
License: https://creativecommons.org/publicdomain/zero/1.0/
The local SVG preserves the artwork paths, with editor metadata removed.
