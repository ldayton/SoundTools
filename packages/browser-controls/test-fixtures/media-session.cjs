// Observe native callbacks without replacing the browser's Media Session API.
function mediaSessionProbe() {
  window.mediaActions = new Map();
  window.mediaRegistrationSessionTypes = [];
  const descriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'mediaSession');
  if (!descriptor?.get) return;
  const wrapped = new WeakSet();
  Object.defineProperty(Navigator.prototype, 'mediaSession', {
    ...descriptor,
    get() {
      const session = descriptor.get.call(this);
      if (session && !wrapped.has(session)) {
        wrapped.add(session);
        const register = session.setActionHandler.bind(session);
        session.setActionHandler = (action, handler) => {
          window.mediaActions.set(action, handler);
          window.mediaRegistrationSessionTypes.push(navigator.audioSession?.type);
          register(action, handler);
        };
      }
      return session;
    },
  });
}
module.exports = { mediaSessionProbe };
