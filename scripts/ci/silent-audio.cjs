// Silence only the hardware-output branch. Upstream analysers, worklets,
// capture destinations and OfflineAudioContext renders retain their real PCM.
// Native Chromium muting remains enabled too; WebKit needs this output sink.
function silenceAudioOutput() {
  if (typeof AudioNode === 'undefined') return;
  const prototype = AudioNode.prototype;
  const installed = Symbol.for('soundtools.test.silent-audio');
  if (prototype[installed]) return;
  Object.defineProperty(prototype, installed, { value: true });
  const connect = prototype.connect, disconnect = prototype.disconnect;
  const sinks = new WeakMap();
  function liveDestination(node, target) {
    return target === node.context.destination &&
      !(typeof OfflineAudioContext !== 'undefined' && node.context instanceof OfflineAudioContext);
  }
  prototype.connect = function (...args) {
    if (!liveDestination(this, args[0])) return Reflect.apply(connect, this, args);
    const destination = args[0];
    let sink = sinks.get(this.context);
    if (!sink) {
      sink = this.context.createGain();
      sink.gain.value = 0;
      Reflect.apply(connect, sink, [destination]);
      sinks.set(this.context, sink);
    }
    args[0] = sink;
    Reflect.apply(connect, this, args);
    return destination; // Preserve the native connect(AudioNode) return value.
  };
  prototype.disconnect = function (...args) {
    if (liveDestination(this, args[0]) && sinks.has(this.context)) args[0] = sinks.get(this.context);
    return Reflect.apply(disconnect, this, args);
  };
}
module.exports = { silenceAudioOutput };
