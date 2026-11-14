import { test } from 'node:test';
import assert from 'node:assert/strict';
import { volumePercent, volumeDecibels } from '@ldayton/ui/volume';
test('volume UI includes actual silence and preserves amplitude across percent/dB adapters', () => {
  assert.equal(volumePercent(0),100);
  assert.equal(volumePercent(-60),0);
  assert.equal(volumeDecibels(0),-60);
  assert.equal(volumeDecibels(100),0);
  for (const percent of [1,6,25,50,75,100])
    assert.equal(volumePercent(volumeDecibels(percent)),percent);
  assert.ok(Math.abs(volumeDecibels(50) + 6.0206) < .0001);
});
