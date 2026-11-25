/** Credits printed with the score, shared by screen, print and PDF export. */
export function hymnScoreCredits(credits:readonly string[]) {
  return credits.filter(credit=>/^(Words:|Music:|(?:\p{L}+\s+)?translation:|Tabledited by )/iu.test(credit))
    .map(credit=>credit.split(/\s+Setting:/i)[0].replace(/\s+/g," ").trim());
}
