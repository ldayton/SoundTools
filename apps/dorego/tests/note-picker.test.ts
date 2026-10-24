import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNote } from '../src/note-picker';

test('typed note entry handles sharps, flats, case, whitespace and enharmonic bounds', () => {
  for (const [text, midi] of [
    ['E3', 52],
    ['f#4', 66],
    ['F♯4', 66],
    ['Bb3', 58],
    ['b♭3', 58],
    [' C1 ', 24],
    ['C7', 96],
    ['B#6', 96],
    ['Cb2', 35],
  ] as const)
    assert.equal(parseNote(text), midi, text);
  for (const text of ['', 'H3', 'C0', 'C8', 'C#7', 'Cb1', 'E', '52', 'E3oops', 'C##4'])
    assert.equal(parseNote(text), null, text);
});
