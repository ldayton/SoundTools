# Soundglow

A mobile-friendly, live microphone spectrogram built with the Web Audio API and Canvas. Audio processing stays in the browser.

## Run locally

```sh
python3 -m http.server 8765 --directory dist
```

Open http://localhost:8765 and allow microphone access, or choose **Test speech** to use the bundled English recording without a microphone. Settings include frequency range, scale, FFT size, colour, brightness, and history length. The speech test supports looping, seeking, and optional audible playback.

Microphone capture requires HTTPS or localhost. For deployment, serve the contents of `dist/` as static files.

## Verify

```sh
node --check dist/app.js
node tests/spectrum.cjs
```

The tests cover signal placement, interpolation, Retina dimensions, microphone fallback and cleanup, and the recorded-speech input.

## Audio credits

The default test recording is a 30-second excerpt of Peter Yearsley's LibriVox reading of *Alice's Adventures in Wonderland*. Audio source and rights details, including those of the earlier German test recording, are in [dist/audio/CREDITS.txt](dist/audio/CREDITS.txt).

## Hosting

The `.openai/hosting.json` manifest identifies the existing private Sites deployment. It is not needed to serve the app elsewhere.
