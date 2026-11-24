/** User-supplied printed scores link to the transcription bundled with the app. */
const printedScores = import.meta.glob<string>(
  "../../../apps/songalong/hymns/source/*.abc",
  // Even short transcriptions need a navigable file. Chromium blocks opening
  // Vite's default inline data URLs from the About link's new browser tab.
  { eager: true, query: "?url&no-inline", import: "default" },
);
export function printedHymnSource(file: string) {
  const url = printedScores[`../../../apps/songalong/hymns/source/${file}`];
  if (!url) throw Error(`Missing bundled printed score: ${file}`);
  return url;
}
