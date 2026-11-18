// Preserve every original approved hash. Only add a portable digest after the
// current take matches that original byte-for-byte, never bless new output.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { genreBackingArrangement } from '../../src/backing-genre-engine';
import { backingFingerprint } from '../backing-fingerprint';
for (const name of ['approved-backing-aff1d47', 'approved-country-58d66b5', 'approved-reggae-funk-sustained', 'reggae-funk-pre-sustain-rhythm']) {
  const file = new URL(name + '.json', import.meta.url);
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  for (const row of rows) {
    const take = genreBackingArrangement(row.style || 'country', row.mode, row.quality, row.cycle, row.tempo, row.tonic);
    const value = name === 'reggae-funk-pre-sustain-rhythm' ? take.events.filter(e => e.part !== 'guitar') : take;
    assert.equal(createHash('sha256').update(JSON.stringify(value)).digest('hex'), row.sha256, 'Original approved snapshot must match before normalization: ' + JSON.stringify(row));
    row.portableSha256 = backingFingerprint(value);
  }
  writeFileSync(file, JSON.stringify(rows, null, 2) + '\n');
  console.log('Preserved and normalized approved snapshots:', name, rows.length);
}
