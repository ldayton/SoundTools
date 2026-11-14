// Linux WebKit reports a failed automatic SW script fetch as a stackless
// pageerror. It is a transport diagnostic while disconnected, not a JS throw.
// Keep the exception limited to the exact worker URL and offline test phase.
export function isOfflineWorkerFetchError(
  error: Pick<Error, 'message' | 'stack'>,
  browser: string,
  offline: boolean,
  workerURL: string
): boolean {
  if (browser !== 'webkit' || !offline || error.stack) return false;
  const worker = new URL(workerURL);
  const message = error.message.replace(/^https?:/, '').replace(/^\/+/, '');
  return message === `${worker.host}${worker.pathname} due to access control checks.`;
}
