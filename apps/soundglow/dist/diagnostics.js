// SPDX-License-Identifier: GPL-3.0-or-later
(function () {
  const release =
    document.querySelector('meta[name="soundglow-release"]')?.content ||
    "local-source";
  const dsn =
    window.SoundglowDiagnosticsConfig?.dsn ||
    document.querySelector('meta[name="soundglow-sentry-dsn"]')?.content ||
    "";
  const environment =
    document.querySelector('meta[name="soundglow-diagnostics-environment"]')
      ?.content || "development";
  const client = BrowserDiagnostics.create({
    app: "soundglow",
    release,
    dsn,
    environment,
    enabled: environment === "production",
    sdkUrl: document.getElementById("diagnosticsCore").dataset.reporter,
    fields: {
      preset: ["soundglow", "praat", "voice", "custom"],
      method: ["raw", "filtered", "corroborated"],
      confirmationMs: "number",
      state: [
        "MIC OFF",
        "STOPPED",
        "CONNECTING",
        "LIVE",
        "INTERRUPTED",
        "LOADING",
        "EXAMPLE",
        "PAUSED",
        "FILE",
      ],
      analysisRate: "number",
      windowMs: "number",
      workerMs: "number",
      pendingMs: "number",
    },
    snapshot() {
      const host = window.soundglowSession,
        s = host?.state(),
        feature = host?.featureState?.();
      return {
        ...host?.diagnosticState?.(),
        view: feature?.active,
        running: s?.running,
        paused: s?.paused,
        sampleRate: s?.sampleRate,
        audioState: s?.audioState,
        method: feature?.pitch?.method,
        confirmationMs: feature?.pitch?.confirmationMs,
      };
    },
  });
  window.SoundglowDiagnostics = client;
  const controls = new Set([
    "start",
    "begin",
    "freeze",
    "demo",
    "restart",
    "settings",
    "openSettings",
    "collapseSettings",
    "spectrogramTab",
    "pitchTab",
  ]);
  document.addEventListener("click", (event) => {
    const control = event.target.closest?.("[id]");
    if (controls.has(control?.id))
      client.event("control." + control.id.toLowerCase());
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "pitchPreset") client.event("pitch.preset");
    if (event.target.closest?.("#pitchSettings"))
      client.event("pitch.settings_changed");
    if (event.target.closest?.("#presetSettings"))
      client.event("spectrogram.settings_changed");
  });
})();
