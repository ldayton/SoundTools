import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  arrangeHymn,
  hymnArrangements,
  hymnBarCount,
} from "../../../packages/music-practice/src/hymn-arrangements";
import {
  instrumentEditionIds,
  instrumentEdition,
  chordEdition,
} from "../../../packages/music-practice/src/instrument-editions";
// Freeze unchanged reviewed music, rather than generated ABC whitespace.
// In Christ Alone is owned by its independent teacher/photo and edition goldens.
const musicalBaseline: Record<string, string> = {
  "amazing-grace":
    "89f0730cf58d392e285334db6d55f2e774649380ad4a9f0690b130f8259e407b",
  "jesus-loves-me":
    "4462fe1243d35bcd085128570a4e92b7cf4655f27ed4c053f6985c4fe004a65d",
  "ill-fly-away":
    "100c530e393372e01b2d83cb1d3eb15c3daa3c3039580adc2429eee0065577bc",
  "o-come-all-ye-faithful":
    "9484e50271653d0f4db2708a5c0830f670dc4f576c3a10b98f968e72b000bd82",
  "the-1st-fingerstyle-blues":
    "cedf7b39eefaf67861977f8644b53e79665e2bb17f63bb85449262866b73c980",
};
for (const [id, expected] of Object.entries(musicalBaseline))
  test(`${id}: full scores and every passage preserve the reviewed music`, () => {
    const hymn = hymns.find((h) => h.id === id)!;
    const variants = [];
    for (const arrangement of hymnArrangements(hymn))
      for (const hands of ["both", "right", "left"] as const)
        for (const size of [0, 2, 4]) {
          const first = arrangeHymn(hymn, arrangement.id, size, 0, hands);
          for (let section = 0; section < first.sections; section++) {
            const score = arrangeHymn(
                hymn,
                arrangement.id,
                size,
                section,
                hands,
              ),
              tune = abcjs.parseOnly(score.abc)[0];
            assert.equal(
              tune.warnings?.length || 0,
              0,
              tune.warnings?.join("\n"),
            );
            const audio = tune.setUpAudio({ qpm: 60, chordsOff: true });
            const voices = new Map<
              number,
              { time: number; events: unknown[] }
            >();
            for (const line of tune.lines)
              for (const [si, staff] of (line.staff || []).entries())
                for (const [vi, voice] of (staff.voices || []).entries()) {
                  const key = si + vi,
                    state = voices.get(key) || { time: 0, events: [] };
                  for (const n of voice) {
                    if (n.el_type === "note") {
                      state.events.push([
                        "note",
                        state.time,
                        n.duration,
                        !!n.rest,
                        n.chord?.map((c: { name: string }) => c.name) || [],
                        n.pitches?.map((p) => [
                          p.startSlur?.length || 0,
                          p.endSlur?.length || 0,
                          !!p.startTie,
                          !!p.endTie,
                        ]) || [],
                      ]);
                      state.time += n.duration;
                    }
                    if (n.el_type === "part")
                      state.events.push(["part", state.time, n.title]);
                  }
                  voices.set(key, state);
                }
            variants.push([
              arrangement.id,
              hands,
              size,
              section,
              score.from,
              score.to,
              score.totalBars,
              audio.tracks.map((tr) =>
                tr
                  .filter((n) => n.cmd === "note")
                  .map((n) => [n.pitch, n.start, n.duration]),
              ),
              [...voices],
            ]);
          }
        }
    assert.equal(
      createHash("sha256").update(JSON.stringify(variants)).digest("hex"),
      expected,
      "Pitches, timing, rests, slurs, ties, chords, landmarks and part boundaries must survive refactoring",
    );
  });
test("one registry supplies instrument choices, capo help and renderer capabilities", () => {
  assert.deepEqual(
    [...instrumentEditionIds].sort(),
    [...Object.keys(musicalBaseline),"in-christ-alone"].sort(),
  );
  for (const id of instrumentEditionIds) {
    const hymn = hymns.find((h) => h.id === id)!,
      edition = instrumentEdition(hymn)!;
    assert.deepEqual(
      hymnArrangements(hymn).map((a) => a.id),
      [...(edition.original ? ["original"] : []), "piano", edition.guitarArrangement],
    );
    const profile = chordEdition(hymn);
    if (!profile) continue;
    assert(Object.values(profile.guide).every((text) => text.trim().length));
    assert.equal(Number.isInteger(profile.capo), true);
    if (profile.capo)
      assert(hymnArrangements(hymn).find(a=>a.id===edition.guitarArrangement)!.help.includes(`capo ${profile.capo}`));
    if (profile.layout.mode === "pickup-attached")
      assert.equal(profile.layout.totalBars, hymnBarCount(hymn));
  }
  assert.equal(instrumentEdition({ id: "unregistered" }), undefined);
});
test("guitar notation conventions cover new positions and any capo without song IDs", async () => {
  const { isGuitarPositionMark, editionTempoLabel } =
    await import("../../../packages/music-practice/src/edition-score");
  for (const mark of [
    "I",
    "II",
    "III",
    "IV",
    "VI",
    "VIII",
    "IX",
    "X",
    "XII",
    "XVII",
  ])
    assert(isGuitarPositionMark(mark));
  for (const mark of ["", "p", "i", "m", "a", "Verse", "IIV", "VIIII"])
    assert(!isGuitarPositionMark(mark));
  assert.equal(editionTempoLabel({ tempo: 72, capo: 3 }), "Capo 3 · ♩ = 72");
  assert.equal(editionTempoLabel({ tempo: 70, capo: 2 }, ["Capo 2"]), "♩ = 70");
  assert.equal(editionTempoLabel({ tempo: 80, capo: 0 }), "♩ = 80");
});
