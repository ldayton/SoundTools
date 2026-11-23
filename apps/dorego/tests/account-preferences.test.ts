import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC } from '../src/music';
import { encodePreferences, decodePreferences, preferences } from '../src/preferences';
import { restoreSpec } from '../src/exercise-settings';
import { changes } from '@ldayton/account/sync';
test('cloud preferences preserve exercise/breath/audio choices and keep related pitch settings atomic', () => {
  const state = {
    spec: restoreSpec(
      {
        ...DEFAULT_SPEC,
        bpm: 120,
        droneStrength: 25,
        repeatTwice: true,
        repeatTurnCount: 8,
        repeatHomeCount: 2,
      },
      '1'
    ),
    breathing: { rounds: 7, seconds: 6 },
    channels: 'mono' as const,
    selected: 'breathSquares' as const,
  };
  const records = encodePreferences(state);
  assert.equal(decodePreferences(records).spec.droneStrength, 25);
  assert.equal(decodePreferences(records).spec.repeatTurnCount, 8);
  assert.equal(decodePreferences(records).spec.repeatHomeCount, 2);
  assert.deepEqual(encodePreferences(decodePreferences(records)), records);
  const next = encodePreferences({ ...state, spec: { ...state.spec, low: 55, high: 79, key: 7 } });
  assert.deepEqual(
    changes(records, next).map((change) => change.key),
    ['exercise.pitch']
  );
  assert.throws(() => decodePreferences({ ...records, schema: 2 }), /Update this app/);
  const original = preferences.state;
  assert.throws(() => preferences.apply({ ...records, schema: 2 }));
  assert.equal(preferences.state, original);
  assert.equal(preferences.cloud, false);
});
