// CDP workerVersionUpdated contains changed versions, not a full snapshot.
function trackServiceWorkers(cdp) {
  const versions = new Map(), listeners = new Set();
  const updated = ({ versions: changes }) => {
    for (const version of changes) versions.set(version.versionId, version);
    for (const listener of listeners) listener();
  };
  cdp.on('ServiceWorker.workerVersionUpdated', updated);
  return {
    active(scriptURL, timeout = 5000) {
      return new Promise((resolve, reject) => {
        const finish = (error, value) => { clearTimeout(timer); listeners.delete(check); error ? reject(error) : resolve(value); };
        const check = () => {
          const version = [...versions.values()].find(v => v.scriptURL === scriptURL && v.status === 'activated' && v.runningStatus === 'running');
          if (version) finish(null, version);
        };
        const timer = setTimeout(() => finish(Error('No active running service worker: ' + scriptURL)), timeout);
        listeners.add(check); check();
      });
    },
    dispose() { cdp.off('ServiceWorker.workerVersionUpdated', updated); },
  };
}
module.exports = { trackServiceWorkers };
