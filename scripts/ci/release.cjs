const { apps, team, repository } = require('./apps.cjs');
const { appendFileSync } = require('node:fs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Release credentials are available only in the protected, per-app environment.
// Never build from a moving branch or promote a deployment for an obsolete SHA.
async function release({ app, sha, token, githubToken, bypass, fetch: request = fetch, sleep = delay, smoke = smokeHTTP, maxPolls = 120, log = console.log }) {
  const config = apps[app];
  if (!config || !/^[a-f0-9]{40}$/.test(sha || '')) throw Error('Choose a known app and full commit SHA');
  if (!token || !githubToken) throw Error('Production release credentials are missing');
  async function json(url, options = {}) {
    const response = await request(url, { ...options, signal: AbortSignal.timeout(60000) });
    if (!response.ok) {
      // Do not echo response bodies: upstream errors may contain credentials or configuration.
      const data = await response.json().catch(() => ({}));
      const code = /^[a-zA-Z0-9_-]+$/.test(data.error?.code || '') ? ` ${data.error.code}` : '';
      throw Error(`Release request failed (${response.status}${code}): ${new URL(url).pathname}`);
    }
    const text = await response.text();
    return text.trim() ? JSON.parse(text) : {};
  }
  const github = path => json(`https://api.github.com/repos/${repository}/${path}`, { headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json' } });
  const vercel = (path, options = {}) => json(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${team}`, {
    ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  async function current() { return (await github('git/ref/heads/main')).object.sha === sha; }
  if (!await current()) return { skipped: 'A newer main revision exists' };
  const project = await vercel(`/v9/projects/${config.project}`);
  if (project.autoAssignCustomDomains !== false) throw Error('Automatic domain assignment must be disabled before staged releases');
  if (project.ssoProtection && !bypass) throw Error('Protected staging requires its project automation credential');
  // A rerun reuses this SHA's staged deployment instead of consuming another build.
  const previous = await vercel(`/v6/deployments?projectId=${config.project}&limit=20`);
  const existing = previous.deployments?.find(d => d.meta?.soundtoolsReleaseSha === sha && d.meta?.soundtoolsReleaseApp === app && ['READY', 'BUILDING', 'QUEUED', 'INITIALIZING'].includes(d.readyState || d.state));
  const created = existing ? { id: existing.uid || existing.id } : await vercel('/v13/deployments', { method: 'POST', body: JSON.stringify({
    name: config.name, project: config.project, target: 'production',
    gitSource: { type: 'github', org: 'ldayton', repo: 'SoundTools', ref: sha, sha },
    meta: { soundtoolsReleaseSha: sha, soundtoolsReleaseApp: app },
  }) });
  const id = created.id;
  if (!/^dpl_[a-zA-Z0-9]+$/.test(id || '')) throw Error('Invalid staged deployment ID');
  let deployed;
  for (let i = 0; i < maxPolls; i++) {
    deployed = await vercel(`/v13/deployments/${id}`);
    if (deployed.readyState === 'READY') break;
    if (['ERROR', 'CANCELED'].includes(deployed.readyState)) throw Error(`Staged ${app} deployment ${id} ${deployed.readyState}`);
    if (!await current()) return { id, skipped: 'A newer main revision exists; staged deployment was not promoted' };
    await sleep(10000);
  }
  if (deployed?.readyState !== 'READY') throw Error(`Staged ${app} deployment did not become ready`);
  if (deployed.meta?.soundtoolsReleaseSha !== sha || deployed.projectId !== config.project) throw Error('Staged deployment provenance mismatch');
  if (!/^[a-z0-9.-]+\.vercel\.app$/.test(deployed.url || '')) throw Error('Invalid staged deployment URL');
  const origin = `https://${deployed.url}`;
  log(`Checking staged ${app}: ${origin}`);
  await smoke(origin, app, stagedRequest(origin, bypass, request), sha, { bypass });
  if (!await current()) return { id, skipped: 'A newer main revision exists; verified deployment was not promoted' };
  const currentAlias = await vercel(`/v13/deployments/${new URL(config.origin).hostname}`);
  if (currentAlias.id !== id) await vercel(`/v10/projects/${config.project}/promote/${id}`, { method: 'POST' });
  // Promotion is asynchronous. Verify the actual production alias, not just the request.
  let promoted = false;
  for (let i = 0; i < 30; i++) {
    const live = await vercel(`/v13/deployments/${new URL(config.origin).hostname}`);
    if (live.id === id) { promoted = true; break; }
    await sleep(3000);
  }
  if (!promoted) throw Error(`Production alias did not move to verified ${app} deployment`);
  await smoke(config.origin, app, request, sha);
  return { id, origin: config.origin, sha };
}

function stagedRequest(origin, bypass, request = fetch) {
  return (url, options = {}) => {
    if (new URL(url).origin !== origin) throw Error('Staging credential cannot be sent to another origin');
    const headers = new Headers(options.headers);
    if (bypass) headers.set('x-vercel-protection-bypass', bypass);
    return request(url, { ...options, headers, redirect: 'error' });
  };
}

async function smokeHTTP(origin, app, request = fetch, expectedSHA, { bypass } = {}) {
  for (const path of ['/', ...(app === 'soundglow' ? [] : ['/auth/confirm'])]) {
    const r = await request(origin + path, { signal: AbortSignal.timeout(30000), cache: 'no-store' });
    if (!r.ok || !r.headers.get('content-type')?.includes('text/html')) throw Error(`Invalid ${app} release document: ${path}`);
    const html = await r.text();
    if (!html.includes('<html') || !html.includes('<script')) throw Error(`Incomplete ${app} release document`);
    if (path === '/auth/confirm' && (!r.headers.get('cache-control')?.includes('no-store') || r.headers.get('referrer-policy') !== 'no-referrer')) throw Error('Sign-in privacy headers are missing');
  }
  console.log(await require('./preflight.cjs').smokeResources(origin, app, request, expectedSHA));
  if (process.env.RELEASE_BROWSER_SMOKE === '1') await require('./smoke-browser.cjs').smokeBrowser(origin, app, { bypass });
}

module.exports = { release, smokeHTTP, stagedRequest };
if (require.main === module) release({ app: process.argv[2], sha: process.env.GITHUB_SHA, token: process.env.VERCEL_TOKEN, githubToken: process.env.GITHUB_TOKEN, bypass: process.env.VERCEL_AUTOMATION_BYPASS_SECRET || undefined }).then(result => {
  console.log(result);
  if (process.env.GITHUB_OUTPUT && result.origin) appendFileSync(process.env.GITHUB_OUTPUT, `origin=${result.origin}\ndeployment=${result.id}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${process.argv[2]} release\n${result.origin || result.skipped}\nCommit: \`${process.env.GITHUB_SHA}\`\n`);
}).catch(error => { console.error(error.message); process.exitCode = 1; });
