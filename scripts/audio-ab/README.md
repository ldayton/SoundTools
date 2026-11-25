# Listening comparison template

This is the existing green card/transport A/B layout, separated from the old
experiment data. Use it for **one current comparison**. Never add previous
experiments, history navigation or a running catalogue to the listening page.

Copy `index.html` and `player.js` beside a `comparison.json` and matched audio:

```json
{"baseline":"original revision before the whole workstream","clips":[
  {"name":"Song · fingerstyle","detail":"C · 80 BPM","duration":24.2,
   "files":{"A":"before.wav","B":"after.wav"}}
]}
```

The guitar renderer prepares this directory automatically. Serve the resulting
directory over local HTTP. Playback loads only the active pair, keeps position
when switching, pauses other cards, and releases their decoded buffers. Nothing
autoplays. The page does not retain old comparison or mixer state.

Use the original workstream baseline, identical music/key/capo/tempo and static
integrated-loudness matching. Preserve source revisions and raw metrics outside
the listening UI. A pleasing result still requires listening; green tests and
matched meters do not establish that it sounds better.
