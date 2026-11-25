import {isScoreSectionStart} from "./score-markings";
import abcjs, { type AbcVisualParams, type AbsoluteElement } from "abcjs";
import { planScoreSystems, type SystemMeasure } from "./score-system-plan";

type Metrics = { left: number; measures: SystemMeasure[]; barDuration: number }[];
const cache = new Map<string, Metrics>();
// abcjs 6.5 declares a flat array, but its parser requires one break array per section.
export const sectionBreaks = (breaks: number[][]) => breaks as unknown as number[];

/** Measure the same visible voices, lyric padding and signatures as the final pass.
 * Explicit breaks preserve tablature, unlike abcjs's automatic wrap/reparse path. */
export function hymnSystemLayout(
  source: string, params: AbcVisualParams, width: number, annotations: boolean,
  context: unknown[] = [],
) {
  const key = JSON.stringify([source, params.visualTranspose, params.initialClef, params.minPadding, annotations, context]);
  let metrics = cache.get(key);
  if (!metrics) {
    const parsed = abcjs.parseOnly(source)[0];
    let sections = 0, inMusic = false;
    for (const line of parsed.lines) {
      if (line.staff && !inMusic) sections++;
      inMusic = !!line.staff;
    }
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:1px;overflow:hidden";
    document.body.append(probe);
    try {
      // One unexpanded system per section gives natural ink widths. Reusing
      // afterParsing is essential: tuneMetrics() does not run that callback.
      const tune = abcjs.renderAbc(probe, source, {
        ...params, lineBreaks: sectionBreaks(Array.from({length:sections},()=>[])),
        wrap: undefined, staffwidth: 1, format: {...params.format, stretchlast: 0},
      })[0];
      metrics = [];
      for (const line of tune.lines) {
        const voice = line.staff?.[0]?.voices?.[0];
        if (!voice) continue;
        const measures: SystemMeasure[] = [];
        let duration = 0, breakBefore = false, left: number | undefined, previous: number | undefined;
        for (const item of voice) {
          const absolute = (item as typeof item & {abselem?:AbsoluteElement}).abselem;
          if ((item.el_type === "note" || item.el_type === "bar") && absolute) {
            left ??= absolute.x;
            previous ??= absolute.x;
          }
          if (item.el_type === "part" || isScoreSectionStart(item)) breakBefore = true;
          if (item.el_type === "note") duration += item.duration;
          if (item.el_type === "bar" && absolute && previous !== undefined) {
            measures.push({
              width: Math.max(0, absolute.x - previous) + (annotations && duration ? 8 : 0),
              duration, breakBefore, phraseEnd: item.type !== "bar_thin",
            });
            duration = 0; breakBefore = false; previous = absolute.x;
          }
        }
        if (measures.length) metrics.push({left:left || 0, measures, barDuration:tune.getBarLength()});
      }
      cache.set(key, metrics);
      if (cache.size > 32) cache.delete(cache.keys().next().value!);
    } finally { probe.remove(); }
  }
  if (!metrics.length) return undefined;
  return sectionBreaks(metrics.map(section => planScoreSystems(section.measures, Math.max(1, width - section.left), section.barDuration)));
}
