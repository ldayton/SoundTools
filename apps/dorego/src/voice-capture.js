// Capture only. Never monitor the microphone through the speakers.
class VoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(Math.round(sampleRate * 0.05));
    this.used = 0;
    this.start = 0;
  }
  process(inputs, outputs) {
    const channels = inputs[0];
    for (const channel of outputs[0] || []) channel.fill(0);
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      if (!this.used) this.start = (currentFrame + i) / sampleRate;
      let value = 0;
      for (const channel of channels) value += channel[i] || 0;
      this.samples[this.used++] = value / channels.length;
      if (this.used === this.samples.length) {
        this.port.postMessage({ pcm: this.samples, start: this.start }, [this.samples.buffer]);
        this.samples = new Float32Array(Math.round(sampleRate * 0.05));
        this.used = 0;
      }
    }
    return true;
  }
}
registerProcessor('dorego-voice-capture', VoiceCapture);
