/** Hybrid logical clocks retain causal order even if a device clock moves back.
 * Disconnected concurrent edits use physical time, then counter/device tie-breaks.
 * Server admission bounds future clock skew; no clock can infer exact real time
 * across disconnected devices with arbitrary skew. */
export type EditStamp = { time: number; counter: number; node: string };
export function compareStamp(a: EditStamp, b: EditStamp) {
  return (
    a.time - b.time || a.counter - b.counter || a.node.localeCompare(b.node)
  );
}
export function nextStamp(
  node: string,
  seen: (EditStamp | undefined)[],
  now = Date.now(),
): EditStamp {
  const latest = seen
    .filter((s): s is EditStamp => !!s)
    .sort(compareStamp)
    .at(-1);
  const time = Math.max(now, latest?.time || 0);
  return {
    time,
    counter: latest?.time === time ? latest.counter + 1 : 0,
    node,
  };
}
