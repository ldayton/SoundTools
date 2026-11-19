import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backingFingerprint } from './backing-fingerprint';
test('approved snapshots tolerate the observed Mac/Linux one-bit gain difference', () => {
  const mac = { events: [{ note: 60, beat: 24, level: 0.7459801523487936 }] };
  const linux = { events: [{ note: 60, beat: 24, level: 0.7459801523487937 }] };
  assert.equal(backingFingerprint(mac), backingFingerprint(linux));
  for (const event of [{ note: 61, beat: 24, level: 0.7459801523487936 }, { note: 60, beat: 24.0001, level: 0.7459801523487936 }, { note: 60, beat: 24, level: 0.746 }])
    assert.notEqual(backingFingerprint(mac), backingFingerprint({ events: [event] }));
});
test('snapshot normalization preserves event order and rejects invalid numbers', () => {
  assert.notEqual(backingFingerprint([60, 64, 67]), backingFingerprint([67, 64, 60]));
  for (const invalid of [Infinity, -Infinity, NaN]) assert.throws(() => backingFingerprint({ level: invalid }), /finite/);
});
