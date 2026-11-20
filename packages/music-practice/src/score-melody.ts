import abcjs from "abcjs";
/** Beam short notes within each quarter-note beat without changing the source tokens. */
export function beamByBeat(abc: string) {
  const tune = abcjs.parseOnly(abc)[0],
    cuts: { from: number; to: number }[] = [];
  let beat = 0,
    previous:
      { start: number; duration: number; from: number; to: number } | undefined;
  for (const line of tune.lines)
    for (const item of line.staff?.[0]?.voices?.[0] || []) {
      if (item.el_type === "bar") {
        beat = 0;
        previous = undefined;
        continue;
      }
      if (item.el_type !== "note") continue;
      const start = beat,
        duration = item.duration * 4;
      beat += duration;
      if (!item.pitches?.length) {
        previous = undefined;
        continue;
      }
      if (
        previous &&
        previous.duration < 1 &&
        duration < 1 &&
        Math.floor(previous.start + 1e-7) === Math.floor(start + 1e-7)
      ) {
        const tail = abc.slice(previous.from, previous.to).match(/\s*$/)![0]
            .length,
          head = abc.slice(item.startChar!, item.endChar!).match(/^\s*/)![0]
            .length;
        const from = previous.to - tail,
          to = item.startChar! + head;
        if (to > from && !abc.slice(from, to).trim()) cuts.push({ from, to });
      }
      previous = { start, duration, from: item.startChar!, to: item.endChar! };
    }
  for (const { from, to } of cuts.sort((a, b) => b.from - a.from))
    abc = abc.slice(0, from) + abc.slice(to);
  return abc;
}
