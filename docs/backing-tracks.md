# Practice backing tracks

NoteWise's guitar scales exercise owns a `BackingTrackPlayer` and places the
reusable `BackingTrackSettings` group in its right-hand practice options panel.
The group follows the committed scale tonic, including enharmonic spelling;
it intentionally has no separate key picker. Another exercise can own a player
and call `setKey(tonicPitchClass, displayName)` the same way.

Blues and rock use the approved 24-bar performances, without a repeated count-in
or ending. They loop continuously. Bass and supporting guitar are 12 dB below
the initial sampled mix; the kit leads. There is no lead instrument.

The player schedules recorded individual notes using Web Audio. Tempo changes
alter scheduling, not sample pitch. Only bass and guitar transpose with the
exercise key; drum and percussion playback rates stay at 1. Recorded dynamic
layers and alternate takes avoid repeating exactly the same sample on every
stroke. Short envelopes and recorded release samples handle pitched note-offs.
The MIDI performances remain in the data pack's reference key of A.

Play must be clicked before an AudioContext starts or samples are downloaded.
Pause cancels scheduled voices and suspends the context. Leaving the exercise,
hiding the document, or leaving the page pauses playback. A pending load cannot
start audio after pause/navigation. Reload restores style and tempo, never
playing state. The owner must call `pause()` on leave and `dispose()` on teardown.

`src/assets/backing-v1/manifest.json` contains the editable performances, sample
maps and balances. The pack contains 188 48-kHz/16-bit FLAC recordings, about
10.4 MiB. All recordings are CC0, with the upstream legal texts, exact source
commits and credits beside the manifest. Recordings are adapted from:

- [Virtuosity Drums](https://github.com/sfzinstruments/virtuosity_drums)
- [Black And Blue Basses](https://github.com/sfzinstruments/karoryfer.black-and-blue-basses)
- [Black And Green Guitars](https://github.com/sfzinstruments/karoryfer.black-and-green-guitars)

Vite fingerprints the sample assets and includes them in the application's
verified offline inventory. No sample CDN, proprietary sampler, sfizz, or new
JavaScript dependency is used.

Validation:

```sh
npm test --workspace=notewise
npm run build --workspace=notewise
cd apps/notewise
../../node_modules/.bin/tsx tests/backing-track.browser.ts
```

The browser check decodes and schedules the actual samples, checks key/rate
separation and live tempo changes, waits through a complete loop, checks pause
and navigation, verifies saved settings without autoplay, and exercises 320px,
390px and desktop layouts. `TEST_BROWSER=firefox` or `TEST_BROWSER=webkit` selects
the other browser engines; use `TEST_PORT` when running concurrently.
