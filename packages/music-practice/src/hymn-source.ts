/** User-supplied printed scores link to the transcription bundled with the app. */
const printedScores = import.meta.glob<string>(
  "../../../apps/songalong/hymns/source/*.abc",
  { eager: true, query: "?url", import: "default" },
);
export function printedHymnSource(file: string) {
  const url = printedScores[`../../../apps/songalong/hymns/source/${file}`];
  if (!url) throw Error(`Missing bundled printed score: ${file}`);
  return url;
}
