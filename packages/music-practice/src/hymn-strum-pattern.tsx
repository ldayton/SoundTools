/** Clevenger's “1, 2-and, 3, 4” strum, spaced by eighth notes. */
export function HymnStrumPattern() {
  const counts = ["1", "&", "2", "&", "3", "&", "4", "&"];
  const strokes = ["↓", "", "↓", "↑", "↓", "", "↓", ""];
  return (
    <figure
      className="hymn-strum-pattern"
      aria-label="Strumming pattern: down on 1, down on 2, up on the and of 2, down on 3, down on 4. Repeat each bar."
    >
      <figcaption>Strum</figcaption>
      <div className="hymn-strum-grid" aria-hidden="true">
        {counts.map((count, i) => (
          <span key={`count-${i}`} className="hymn-strum-count">
            {count}
          </span>
        ))}
        {strokes.map((stroke, i) => (
          <span key={`stroke-${i}`} className="hymn-strum-stroke">
            {stroke || "·"}
          </span>
        ))}
      </div>
    </figure>
  );
}
