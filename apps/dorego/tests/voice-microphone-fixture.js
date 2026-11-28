(() => {
  const probe = { calls: 0, stopped: 0, deny: false, hold: false, release: null, tracks: [] };
  window.voiceProbe = probe;
  const devices = navigator.mediaDevices;
  Object.defineProperty(navigator, 'mediaDevices', { value: devices });
  Object.defineProperty(devices, 'getUserMedia', {
    configurable: true,
    value: async () => {
      probe.calls++;
      if (probe.deny) throw new DOMException('Denied', 'NotAllowedError');
      const ctx = new AudioContext(),
        osc = ctx.createOscillator(),
        gain = ctx.createGain(),
        destination = ctx.createMediaStreamDestination();
      osc.frequency.value = 261.625565;
      gain.gain.value = 0.2;
      osc.connect(gain);
      gain.connect(destination);
      osc.start();
      await ctx.resume();
      for (const track of destination.stream.getTracks()) {
        probe.tracks.push(track);
        const stop = track.stop.bind(track);
        track.stop = () => {
          probe.stopped++;
          stop();
          osc.stop();
          void ctx.close();
        };
      }
      if (probe.hold)
        await new Promise((resolve) => {
          probe.release = resolve;
        });
      return destination.stream;
    },
  });
})();
