const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { manifestLimits } = require('@ldayton/browser-offline');
const { apps } = require('./apps.cjs');
const root = path.resolve(__dirname, '../..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function inventory(app, pack) {
  if (!apps[app]) throw Error('Unknown preflight app');
  const limits = manifestLimits[apps[app].offlineGroup || (app === 'notewise' || app === 'songalong' ? 'practice' : app)];
  if (!Array.isArray(pack.files) || !pack.files.length || pack.files.length > limits.files || (pack.optional || []).length > limits.optional) throw Error('Offline inventory exceeds worker limits');
  const base = pack.base || (app === 'dorego' ? Object.keys(pack.hashes || {}).find(url => url.endsWith('/')) : '/');
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base || '')) throw Error('Invalid offline inventory base');
  const all = [...pack.files, ...(pack.optional || [])];
  if (new Set(all.map(f => f.url)).size !== all.length) throw Error('Duplicate offline inventory URL');
  if (app === 'dorego') {
    if (!Array.isArray(pack.shell) || !pack.shell.length || pack.shell.length > limits.shell || !pack.hashes) throw Error('Invalid shell inventory');
    for (const url of pack.shell) if (url !== base + 'offline-pack.json' && !pack.hashes[url]) throw Error('Shell resource has no integrity hash');
    for (const [url, sha256] of Object.entries(pack.hashes)) all.push({ url, sha256 });
  }
  const unique = new Map();
  for (const file of all) {
    if (typeof file.url !== 'string' || !file.url.startsWith(base) || /[\\?#%]/.test(file.url) || file.url.includes('..') || file.url.endsWith('.map') || !/^[a-f0-9]{64}$/.test(file.sha256) || (file.bytes !== undefined && (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > 64 * 1024 * 1024))) throw Error('Invalid offline resource descriptor');
    if (unique.has(file.url) && unique.get(file.url).sha256 !== file.sha256) throw Error('Conflicting offline resource hash');
    unique.set(file.url, file);
  }
  return { base, files: [...unique.values()] };
}
function preflight(app, output) {
  const manifest = path.join(output, app === 'soundglow' ? 'release.json' : 'offline-pack.json');
  const data = inventory(app, JSON.parse(fs.readFileSync(manifest)));
  for (const file of data.files) {
    const relative = file.url.slice(data.base.length) || 'index.html';
    const bytes = fs.readFileSync(path.join(output, relative));
    if ((file.bytes !== undefined && bytes.length !== file.bytes) || digest(bytes) !== file.sha256) throw Error(`Final offline resource bytes do not match: ${file.url}`);
  }
  if (!fs.existsSync(path.join(output, 'sw.js'))) throw Error('Release is missing its service worker');
  console.log(`Preflight ${app}: ${data.files.length} final resources match the worker inventory`);
  return data;
}
function buildInfo(app, output, profile) {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('Release requires a full source revision');
  fs.writeFileSync(path.join(output, 'build-info.json'), JSON.stringify({ app, sha, profile }));
}
async function smokeResources(origin, app, request = fetch, expectedSHA) {
  const get = async p => { const r = await request(origin + p, { signal: AbortSignal.timeout(30000), cache: 'no-store', redirect: 'error' }); if (!r.ok) throw Error(`Release resource unavailable: ${p} (${r.status})`); return r; };
  const info = await (await get('/build-info.json')).json();
  if (info.app !== app || info.profile !== 'production' || (expectedSHA && info.sha !== expectedSHA)) throw Error('Live release app, configuration or commit does not match');
  const pack = await (await get(app === 'soundglow' ? '/release.json' : '/offline-pack.json')).json();
  const data = inventory(app, pack);
  const files = data.files.filter(f => /\.(?:html|js|mjs|css|json|wasm|woff2?)$/.test(f.url) || f.url === data.base);
  const sample = data.files.find(f => /\.(?:flac|m4a|wav)$/.test(f.url));
  if (sample) files.push(sample);
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => { while (next < files.length) { const file = files[next++], bytes = Buffer.from(await (await get(file.url)).arrayBuffer()); if (digest(bytes) !== file.sha256) throw Error(`Live release integrity mismatch: ${file.url}`); } }));
  return { app, sha: info.sha, verified: files.length };
}
module.exports = { inventory, preflight, buildInfo, smokeResources };
