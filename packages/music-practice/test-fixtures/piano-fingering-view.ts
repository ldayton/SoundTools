import abcjs from "abcjs";
import { drawHymnFingerings } from "../src/hymn-fingering";
export function renderPianoFingeringFixture(
  kind: "single" | "multiple" | "chord",
) {
  document.body.innerHTML = '<div id="piano-fingering-fixture"></div>';
  const voices =
    kind === "single"
      ? "%%score r l\nV:r clef=treble\nV:l clef=bass\n"
      : "%%score (r r2) l\nV:r clef=treble\nV:r2 clef=treble\nV:l clef=bass\n";
  const abc =
    "X:1\nM:4/4\nL:1/4\n" +
    voices +
    "K:C\n[V:r] " +
    (kind === "chord" ? "[CEG]4" : "CDEF") +
    " |]\n" +
    (kind === "single" ? "" : "[V:r2] E4 |]\n") +
    "[V:l] C,D,E,F, |]";
  const tune = abcjs.renderAbc("piano-fingering-fixture", abc, {
    add_classes: true,
    staffwidth: 700,
  })[0];
  const audio = tune.setUpAudio({ chordsOff: true });
  const signature = () =>
    JSON.stringify(
      tune.lines.flatMap((l) =>
        (l.staff || []).flatMap((s) =>
          (s.voices || []).flatMap((v) =>
            v.flatMap((n) =>
              n.el_type === "note"
                ? [
                    {
                      duration: n.duration,
                      pitches: n.midiPitches?.map(
                        (p: { pitch: number }) => p.pitch,
                      ),
                      tie: n.pitches?.map((p) => p.endTie),
                    },
                  ]
                : [],
            ),
          ),
        ),
      ),
    );
  const before = signature();
  drawHymnFingerings(tune);
  return {
    unchanged: before === signature(),
    soundingNotes: audio.tracks.flatMap((t) =>
      t.filter((n) => n.cmd === "note"),
    ).length,
    marks: [...document.querySelectorAll<SVGElement>(".hymn-fingering")].map(
      (mark) => ({
        hand: mark.dataset.hand,
        finger: Number(mark.dataset.finger),
        label: mark.getAttribute("aria-label"),
      }),
    ),
  };
}
