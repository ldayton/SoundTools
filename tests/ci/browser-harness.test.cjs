const { test } = require('node:test');
const assert = require('node:assert/strict');
const { browserName, clean } = require('../../scripts/ci/browser-harness.cjs');
test('uses the configured engine and rejects misspellings rather than silently launching Chromium', () => {
  assert.equal(browserName({ TEST_BROWSER: 'firefox' }), 'firefox');
  assert.equal(browserName({ SOUNDGLOW_TEST_BROWSER: 'webkit' }), 'webkit');
  assert.throws(() => browserName({ TEST_BROWSER: 'chrome' }), /Unknown/);
});
test('failure output redacts sign-in credentials', () => { assert.equal(clean('https://example.test/#token_hash=secret&type=email'), 'https://example.test/#token_hash=[redacted]&type=email'); });
test('all visual tests inherit silent audio contexts instead of bypassing the common fixture', () => {
  const fs = require('node:fs'), path = require('node:path');
  const directory = path.resolve(__dirname, '../../apps/soundglow/tests/visual');
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.spec.cjs'))) {
    const source = fs.readFileSync(path.join(directory, file), 'utf8');
    assert.match(source, /require\(['"]\.\/fixtures\.cjs['"]\)/, file);
    assert.doesNotMatch(source, /require\(['"]@playwright\/test['"]\)/, file);
  }
});
test('silent output preserves native connection returns, disconnect targets and capture/offline branches', () => {
  const { silenceAudioOutput } = require('../../scripts/ci/silent-audio.cjs');
  class Node {
    constructor(context) { this.context = context; this.connections = []; this.disconnections = []; }
    connect(...args) { this.connections.push(args); return args[0]; }
    disconnect(...args) { this.disconnections.push(args); }
  }
  class Live {
    constructor() { this.destination = {}; this.gains = []; }
    createGain() { const node = new Node(this); node.gain = { value: 1 }; this.gains.push(node); return node; }
  }
  class Offline extends Live {}
  const install = () => require('node:vm').runInNewContext(`(${silenceAudioOutput})()`, { AudioNode: Node, OfflineAudioContext: Offline });
  install(); install();
  const context = new Live(), source = new Node(context), capture = new Node(context);
  assert.equal(source.connect(context.destination), context.destination);
  const sink = context.gains[0];
  assert.equal(sink.gain.value, 0);
  assert.equal(source.connections[0][0], sink);
  assert.equal(sink.connections[0][0], context.destination);
  source.disconnect(context.destination);
  assert.equal(source.disconnections[0][0], sink);
  source.connect(capture);
  assert.equal(source.connections[1][0], capture);
  const offline = new Offline(), numerical = new Node(offline);
  numerical.connect(offline.destination);
  assert.equal(numerical.connections[0][0], offline.destination);
  assert.equal(offline.gains.length, 0);
  assert.equal(context.gains.length, 1, 'Repeated policy installation must not wrap the graph twice');
});
