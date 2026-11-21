const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { apps: appConfig } = require('./apps.cjs');
const root = path.resolve(__dirname, '../..');
const names = Object.keys(appConfig);
function workspaces(directory = root) {
  return ['apps', 'packages'].flatMap(parent => fs.readdirSync(path.join(directory, parent)).flatMap(name => {
    const folder = `${parent}/${name}`, file = path.join(directory, folder, 'package.json');
    if (!fs.existsSync(file)) return [];
    const manifest = JSON.parse(fs.readFileSync(file));
    return [{ folder, name: manifest.name, dependencies: Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies }) }];
  }));
}
function affected(files, graph = workspaces(), all = false) {
  const test = new Set(all ? names : []), deploy = new Set();
  let accounts = all;
  function consumers(folder) {
    const entry = graph.find(p => p.folder === folder);
    if (!entry) return names; // Deleted or unfamiliar workspace: fail conservatively.
    const selected = new Set([entry.name]);
    let changed = true;
    while (changed) { changed = false; for (const p of graph) if (!selected.has(p.name) && p.dependencies.some(d => selected.has(d))) { selected.add(p.name); changed = true; } }
    return names.filter(app => selected.has(graph.find(p => p.folder === `apps/${app}`)?.name));
  }
  for (const file of files) {
    if (/^(docs\/|README(?:\.|$)|AGENTS\.md$)|\.md$/.test(file)) continue;
    if (/(?:^|[\/.-])(?:account|accounts|auth|persistence|sync)(?:[\/.-]|$)/.test(file)) accounts = true;
    const workspace = /^(apps|packages)\/([^/]+)\//.exec(file);
    const testOnly = /(^|\/)(tests?|test-fixtures|browser-tests)\//.test(file) || /\.(test|spec)\./.test(file);
    if (workspace) {
      const folder = `${workspace[1]}/${workspace[2]}`, targets = consumers(folder);
      if (!graph.some(p => p.folder === folder)) accounts = true;
      for (const app of targets) { test.add(app); if (!testOnly) deploy.add(app); }
    } else if (file.startsWith('supabase/')) { accounts = true; }
    else {
      for (const app of names) test.add(app);
      const infrastructureTest = /^(\.github\/|tests\/|scripts\/(test-|check-|install-ci|ci\/))/.test(file);
      if (!infrastructureTest) for (const app of names) deploy.add(app);
      accounts = true;
    }
  }
  return { apps: names.filter(x => test.has(x)), deploy: all ? [] : names.filter(x => deploy.has(x)), accounts };
}

async function changes({ env = process.env, fetch: request = fetch, git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim() } = {}) {
  const event = env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH)) : {};
  const head = env.GITHUB_SHA || git(['rev-parse', 'HEAD']);
  if (env.GITHUB_EVENT_NAME === 'schedule' || env.GITHUB_EVENT_NAME === 'workflow_dispatch') return { ...affected([], workspaces(), true), base: null, head };
  // Source validation follows this push. Pending releases are recovered below
  // from each app's live SHA, independent of unrelated workflow failures.
  const base = env.CI_BASE_SHA || event.pull_request?.base?.sha || event.before;
  if (!base) return { apps: names, deploy: env.GITHUB_EVENT_NAME === 'pull_request' ? [] : names, accounts: true, base: null, head };
  if (!/^[a-f0-9]{40}$/.test(base) || !/^[a-f0-9]{40}$/.test(head)) throw Error('Changes require full commit SHAs');
  let files;
  try { files = git(['diff', '--name-only', '--no-renames', `${base}...${head}`]).split('\n').filter(Boolean); }
  catch { return { apps: names, deploy: env.GITHUB_EVENT_NAME === 'pull_request' ? [] : names, accounts: true, base: null, head }; }
  const result = affected(files);
  if (env.GITHUB_EVENT_NAME === 'push') {
    // Validation can finish while a newer commit prevents promotion. Compare
    // publication separately against each app's actual live revision, so that
    // an unpromoted code change is never lost behind a later docs-only push.
    const pending = await Promise.all(names.map(async app => {
      try {
        const r = await request(appConfig[app].origin + '/build-info.json', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!r.ok) return { app, accounts: true };
        const info = await r.json();
        if (info.app !== app || info.profile !== 'production' || !/^[a-f0-9]{40}$/.test(info.sha)) return { app, accounts: true };
        git(['merge-base', '--is-ancestor', info.sha, head]);
        const changes = git(['diff', '--name-only', '--no-renames', `${info.sha}...${head}`]).split('\n').filter(Boolean);
        const live = affected(changes);
        return { app: live.deploy.includes(app) ? app : null, accounts: live.accounts };
      } catch { return { app, accounts: true }; }
    }));
    result.deploy = pending.map(p => p.app).filter(Boolean);
    result.apps = names.filter(app => result.apps.includes(app) || result.deploy.includes(app));
    result.accounts ||= pending.some(p => p.accounts);
  }
  return { ...result, base, head, files };
}
module.exports = { workspaces, affected, changes };
if (require.main === module) changes().then(result => {
  console.log(JSON.stringify(result, null, 2));
  const { fromEvent, tiers } = require('./tiers.cjs');
  const tier = fromEvent(process.env.GITHUB_EVENT_NAME, process.env.CI_TIER);
  const matrices = Object.fromEntries(names.map(app => [app, require('./test-strategy.cjs').matrix(app, tier)]));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `apps=${JSON.stringify(result.apps)}\ndeploy=${JSON.stringify(result.deploy)}\naccounts=${tier === 'nightly' && result.accounts}\nmatrices=${JSON.stringify(matrices)}\ntier=${tier}\naccountBrowsers=${JSON.stringify(tiers[tier].browsers)}\n`);
}).catch(e => { console.error(e.message); process.exitCode = 1; });
