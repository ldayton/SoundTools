const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { apps, repository } = require('./apps.cjs');
const root = path.resolve(__dirname, '../..');
const names = Object.keys(apps);
function workspaces(directory = root) {
  return ['apps', 'packages'].flatMap(parent => fs.readdirSync(path.join(directory, parent)).flatMap(name => {
    const folder = `${parent}/${name}`, file = path.join(directory, folder, 'package.json');
    if (!fs.existsSync(file)) return [];
    const manifest = JSON.parse(fs.readFileSync(file));
    return [{ folder, name: manifest.name, dependencies: Object.keys({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies }) }];
  }));
}
function affected(files, graph = workspaces(), full = false) {
  const test = new Set(full ? names : []), deploy = new Set();
  let accounts = full;
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
    const workspace = /^(apps|packages)\/([^/]+)\//.exec(file);
    const testOnly = /(^|\/)(tests?|test-fixtures|browser-tests)\//.test(file) || /\.(test|spec)\./.test(file);
    if (workspace) {
      const folder = `${workspace[1]}/${workspace[2]}`, targets = consumers(folder);
      for (const app of targets) { test.add(app); if (!testOnly) deploy.add(app); }
      if (!testOnly && targets.length) accounts = true;
    } else if (file.startsWith('supabase/')) { accounts = true; }
    else {
      for (const app of names) test.add(app);
      const infrastructureTest = /^(\.github\/|tests\/|scripts\/(test-|check-|install-ci|ci\/))/.test(file);
      if (!infrastructureTest) for (const app of names) deploy.add(app);
      accounts = true;
    }
  }
  return { apps: names.filter(x => test.has(x)), deploy: full ? [] : names.filter(x => deploy.has(x)), accounts };
}

async function changes({ env = process.env, fetch: request = fetch, git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim() } = {}) {
  const event = env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH)) : {};
  const head = env.GITHUB_SHA || git(['rev-parse', 'HEAD']);
  if (env.GITHUB_EVENT_NAME === 'schedule' || env.GITHUB_EVENT_NAME === 'workflow_dispatch') return { ...affected([], workspaces(), true), base: null, head };
  let base = env.CI_BASE_SHA || event.pull_request?.base?.sha;
  if (!base && env.GITHUB_EVENT_NAME === 'push') {
    // Comparing only with the previous push loses changes when that run was cancelled.
    // A completed push workflow includes successful releases; scheduled runs never advance it.
    try {
      const r = await request(`https://api.github.com/repos/${repository}/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=100`, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw Error('Could not read successful validation baseline');
      base = (await r.json()).workflow_runs?.find(r => r.head_sha !== head)?.head_sha;
    } catch { /* Full validation is safer than skipping an unknown change. */ }
  }
  if (!base) return { apps: names, deploy: env.GITHUB_EVENT_NAME === 'pull_request' ? [] : names, accounts: true, base: null, head };
  if (!/^[a-f0-9]{40}$/.test(base) || !/^[a-f0-9]{40}$/.test(head)) throw Error('Changes require full commit SHAs');
  let files;
  try { files = git(['diff', '--name-only', '--no-renames', `${base}...${head}`]).split('\n').filter(Boolean); }
  catch { return { apps: names, deploy: env.GITHUB_EVENT_NAME === 'pull_request' ? [] : names, accounts: true, base: null, head }; }
  return { ...affected(files), base, head, files };
}
module.exports = { workspaces, affected, changes };
if (require.main === module) changes().then(result => {
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `apps=${JSON.stringify(result.apps)}\nbuilds=${JSON.stringify([...new Set([...result.apps, ...(result.apps.includes("songalong") ? ["notewise"] : [])])])}\ndeploy=${JSON.stringify(result.deploy)}\naccounts=${result.accounts}\n`);
}).catch(e => { console.error(e.message); process.exitCode = 1; });
