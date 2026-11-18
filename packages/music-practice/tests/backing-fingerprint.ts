import { createHash } from 'node:crypto';
/** Musical snapshots preserve integer pitches/order exactly. Math.sin's final
 * floating-point bits can differ across OS/CPU libm implementations; nine
 * decimal places retain far finer timing/gain resolution than audio samples. */
export function backingFingerprint(value: unknown): string {
  const json = JSON.stringify(value, (_key, item) => {
    if (typeof item !== 'number') return item;
    if (!Number.isFinite(item)) throw Error('Backing snapshots require finite numbers');
    return Number.isInteger(item) ? item : Number(item.toFixed(9));
  });
  return createHash('sha256').update(json).digest('hex');
}
