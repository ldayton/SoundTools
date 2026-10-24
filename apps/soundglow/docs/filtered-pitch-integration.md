# Filtered pitch integration (local)

Soundglow's pitch preset now requests filtered autocorrelation, with the decision settings held constant from the matched experiment (.03 attenuation, .03 silence threshold, .45 voicing threshold, .01 octave cost, .35 octave-jump cost, .14 voiced/unvoiced cost). The existing speech gate and 50 ms rise confirmation remain. The custom candidate decoder is not used. The Praat pitch preset continues to request raw autocorrelation; spectrogram processing is unchanged.

`method` is an ordinary saved pitch setting (`raw` or `filtered`) with a selector under Advanced trace. Legacy named custom presets without the setting retain raw. Built-in Soundglow restoration picks up filtered from the preset definition.

The WASM adapter exposes a validated per-request method setter. The worker processor explicitly sets the method before every pitch request, including raw/default requests, to prevent persistent-WASM state leaking between clients. Updated release binaries are accompanied by their exact source archive and verified build manifest.

Changing the method reanalyses retained PCM via the existing PraatStream reconfiguration/handover mechanism. Audio transport and the current trace remain in place during rebuilding. On commit, history, contour and grouping state switch together. Speech flags are retained for the same history interval. Rapid switches cancel superseded rebuilds; paused transport remains paused. On rebuild failure the setting is restored to the still-active method and an error is shown.

Validation: core real-WASM tests; a new method-switching test (including raw→filtered→raw state isolation and unchanged spectrogram); desktop/mobile browser regression for live and paused detector changes and rapid cancellation; interactive English-example playback. The private recording's integrated filtered observations exactly matched the earlier research detector, and no accepted above-500 Hz frames survived the unchanged confirmation filter. This is one private regression case, not a claim of universal high-pitch correctness. Private audio and derivatives remain ignored and outside Git.

Final full build passed: core checks, 106 browser tests (5 configured skips), update/offline/cache checks, and immutable release packaging. Slowed-browser continuity checks passed. This is desktop Chromium and mobile-layout testing, not physical-phone validation. No commits or pushes were made.
