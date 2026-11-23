import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patternPositions, cagedScaleSource, type ScaleShape } from '../src/guitar-scale-patterns';
import type { ScaleQuality } from '../src/guitar-scales';

type Chart = {
  quality: ScaleQuality;
  shape: ScaleShape;
  tonic: number;
  page: string;
  octaveOffset: number;
  frets: number[][];
  fingers?: number[][];
};
// Reviewed external facts, never generated from production pattern tables.
// Source image URLs/hashes identify the chart reviewed; CI stays offline.
const { charts } = JSON.parse(readFileSync(
  new URL('./fixtures/caged-reference.json', import.meta.url), 'utf8',
)) as { charts: Chart[] };
const tuning = [40, 45, 50, 55, 59, 64];

function referenceNotes(chart: Chart, tonic = chart.tonic) {
  return chart.frets.flatMap((frets, row) => frets.map((publishedFret, column) => {
    const fret = publishedFret + chart.octaveOffset;
    return {
      string: 6 - row, fret, midi: tuning[row] + fret,
      root: (tuning[row] + fret) % 12 === tonic,
      ...(chart.fingers ? { finger: chart.fingers[row][column] } : {}),
    };
  }));
}

function actualNotes(tonic: number, quality: ScaleQuality, shape: ScaleShape, publishedFingers: boolean) {
  return patternPositions(tonic, quality, shape, 0).map(({ string, fret, midi, root, finger }) => ({
    string, fret, midi, root, ...(publishedFingers ? { finger } : {}),
  }));
}

for (const chart of charts) {
  test(`GuitarScale.org ${chart.quality} shape ${chart.shape}: positions, roots and published fingers`, () => {
    assert.deepEqual(actualNotes(chart.tonic, chart.quality, chart.shape, !!chart.fingers), referenceNotes(chart));
    assert.equal(cagedScaleSource(chart.quality).url, chart.page);
  });
}

test('major pentatonic/blues re-root the referenced relative-minor regions', () => {
  // E/D/C/A/G major forms correspond to Dm/Cm/Am/Gm/Em minor forms.
  // This mapping is independent of the production relativePattern helper.
  const pairs = [['1', '2'], ['2', '3'], ['3', '4'], ['4', '5'], ['5', '1']] as const;
  const families = [
    ['major-pentatonic', 'minor-pentatonic'],
    ['major-blues', 'minor-blues'],
  ] as const;
  for (const [major, minor] of pairs) for (const [quality, sourceQuality] of families) {
    const chart = charts.find(c => c.quality === sourceQuality && c.shape === minor)!;
    assert.deepEqual(actualNotes(0, quality, major, !!chart.fingers), referenceNotes(chart, 0));
  }
  assert.deepEqual(cagedScaleSource('major-blues'), {
    url: 'https://www.guitarscale.org/c-blues.html',
    label: 'GuitarScale.org · major-blues formula (Related scales)',
  });
  assert.throws(() => cagedScaleSource('hijaz'), /Maqamat/);
});
