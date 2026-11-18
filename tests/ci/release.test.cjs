const { test } = require('node:test');
const assert = require('node:assert/strict');
const { release } = require('../../scripts/ci/release.cjs');
const { apps } = require('../../scripts/ci/apps.cjs');
const sha = 'a'.repeat(40);
function fixture({ stale = 99, build = 'READY', auto = false, smokeFails = false, mismatch = false, reusable = false, alreadyLive = false } = {}) {
  const calls = []; let refs = 0, promoted = false;
  const fetch = async (url, options = {}) => {
    calls.push({ url, ...options });
    let data;
    if (url.includes('api.github.com')) data = { object: { sha: ++refs >= stale ? 'b'.repeat(40) : sha } };
    else if (url.includes('/v9/projects/')) data = { autoAssignCustomDomains: auto };
    else if (url.includes('/v6/deployments?')) data = { deployments: reusable ? [{ uid: 'dpl_test', state: 'READY', meta: { soundtoolsReleaseSha: sha, soundtoolsReleaseApp: 'dorego' } }] : [] };
    else if (url.includes('/v13/deployments?')) data = { id: 'dpl_test' };
    else if (url.includes('/promote/')) { promoted = true; return new Response(null, { status: 202 }); }
    else data = { id: url.includes('lilydayton.me') && !promoted && !alreadyLive ? 'dpl_old' : 'dpl_test', readyState: build, projectId: apps.dorego.project, meta: { soundtoolsReleaseSha: mismatch ? 'c'.repeat(40) : sha }, url: 'stage-team.vercel.app' };
    return Response.json(data);
  };
  return { calls, run: () => release({ app: 'dorego', sha, token: 'test-token', githubToken: 'test-gh', fetch, sleep: async () => {}, maxPolls: 2, log: () => {}, smoke: async () => { if (smokeFails) throw Error('Smoke failed'); } }) };
}
test('stages the exact tested SHA and verifies the production alias after promotion', async () => {
  const f = fixture(); const r = await f.run(); assert.equal(r.sha, sha);
  const create = f.calls.find(c => c.url.includes('/v13/deployments?'));
  assert.deepEqual(JSON.parse(create.body).gitSource, { type: 'github', org: 'ldayton', repo: 'SoundTools', ref: sha, sha });
  assert.equal(f.calls.filter(c => c.url.includes('/promote/')).length, 1);
});
for (const [name, options] of Object.entries({ 'obsolete before build': { stale: 1 }, 'obsolete before promotion': { stale: 2 }, 'failed build': { build: 'ERROR' }, 'stuck build': { build: 'BUILDING' }, 'automatic domains enabled': { auto: true }, 'smoke failure': { smokeFails: true }, 'wrong provenance': { mismatch: true } })) {
  test(`never promotes ${name}`, async () => { const f = fixture(options); await f.run().catch(() => {}); assert.equal(f.calls.some(c => c.url.includes('/promote/')), false); });
}
test('rejects missing credentials before making network requests', async () => { await assert.rejects(release({ app: 'dorego', sha }), /credentials/); });
test('a rerun reuses an existing stage and does not repromote an already-current release', async () => { const f = fixture({ reusable: true, alreadyLive: true }); await f.run(); assert.equal(f.calls.some(c => c.url.includes('/v13/deployments?') && c.method === 'POST'), false); assert.equal(f.calls.some(c => c.url.includes('/promote/')), false); });
