// Exactly two test tiers. Domains/groups (app, editions, Accounts, audio,
// shared contracts) subdivide a tier; they are never alternate test tiers.
const tiers = Object.freeze({
  ci: Object.freeze({ name: 'CI', browsers: Object.freeze(['chromium']), publishes: true }),
  nightly: Object.freeze({ name: 'Nightly', browsers: Object.freeze(['chromium', 'webkit']), publishes: false }),
});
function tier(value = 'ci') {
  if (!Object.hasOwn(tiers, value)) throw Error('Choose test tier ci or nightly');
  return value;
}
function fromEvent(event, requested = 'ci') {
  if (event === 'schedule') return 'nightly';
  if (event === 'push' || event === 'pull_request') return 'ci';
  return tier(requested || 'ci');
}
module.exports = { tiers, tier, fromEvent };
