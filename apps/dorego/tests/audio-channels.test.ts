import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_CHANNELS_KEY, readAudioChannels, saveAudioChannels } from '../src/audio-channels';

test('audio output defaults to stereo and safely restores only supported choices', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    assert.equal(readAudioChannels(), 'stereo');
    saveAudioChannels('mono');
    assert.equal(readAudioChannels(), 'mono');
    saveAudioChannels('stereo');
    assert.equal(readAudioChannels(), 'stereo');
    values.set(AUDIO_CHANNELS_KEY, 'left');
    assert.equal(readAudioChannels(), 'stereo');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('Storage blocked');
      },
    });
    assert.equal(readAudioChannels(), 'stereo');
    assert.doesNotThrow(() => saveAudioChannels('mono'));
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
