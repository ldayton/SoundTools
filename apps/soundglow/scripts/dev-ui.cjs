const path = require('node:path');

/** Rollup watches the complete import graph, including shared workspace UI sources. */
async function watchUi({ configFile = path.resolve(__dirname, '../vite.config.ts'), log = console.log } = {}) {
  let finish;
  let pending = new Promise(resolve => { finish = resolve; });
  let failure;
  let building = true;
  const { build } = await import('vite');
  const watcher = await build({ configFile, root: path.dirname(configFile), build: { watch: {}, emptyOutDir: false } });
  watcher.on('event', event => {
    if (event.code === 'BUNDLE_END') void event.result.close();
    if (event.code === 'START') {
      failure = undefined;
      // Requests can already be waiting before the first START event.
      if (!building) pending = new Promise(resolve => { finish = resolve; });
      building = true;
    }
    if (event.code === 'ERROR') {
      failure = event.error;
      building = false;
      finish();
      log('UI build failed. Fix the source and reload; older UI will not be served.');
    }
    if (event.code === 'END') {
      building = false;
      finish();
      if (!failure) log('UI rebuilt. Reload when ready; audio is not interrupted automatically.');
    }
  });
  return {
    async ready() {
      await pending;
      if (failure) throw Object.assign(new Error('UI build failed. Fix the source and reload.'), { code: 'UI_BUILD_FAILED' });
    },
    close: () => watcher.close(),
  };
}
module.exports = { watchUi };
