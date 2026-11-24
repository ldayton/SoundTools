/** Reviewed source-piano harmonies at 1/64-note offsets from the pickup.
 * Instrumental editions may deliberately use a simpler reharmonization.
 */
export const vocalHarmonyGuides: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  "blessed-assurance": {
    192: "A/E", 240: "A", 456: "Em/G", 480: "Em/G",
    792: "A/E", 816: "A", 1032: "Em/G", 1056: "Em/G",
  },
  "joy-to-the-world": {
    56: "Em/G", 64: "D/A", 160: "A", 416: "A",
    536: "Em/G", 544: "D/A",
  },
};
