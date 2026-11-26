import abcjs from "abcjs";
import { drawHymnFingerings } from "../src/hymn-fingering";
export function renderPianoFingeringFixture(
  kind: "single" | "multiple" | "chord" | "unsupported" | "tied" | "long",
) {
  document.body.innerHTML = '<div id="piano-fingering-fixture"></div>';
  const voices =
    kind === "single" || kind === "long"
      ? "%%score r l\nV:r clef=treble\nV:l clef=bass\n"
      : "%%score (r r2) l\nV:r clef=treble\nV:r2 clef=treble\nV:l clef=bass\n";
  const abc =
    "X:1\nM:4/4\nL:1/4\n" +
    voices +
    "K:C\n[V:r] " +
    (kind === "unsupported"
      ? "[CDEFGc]4"
      : kind === "chord"
        ? "[CEG]4"
        : kind === "tied"
          ? "[C-E] [CF] D2"
          : kind === "long"
            ? "CDEFGABcdefgabcd"
            : "CDEF") +
    " |]\n" +
    (kind === "single" || kind === "long"
      ? ""
      : kind === "chord"
        ? "[V:r2] E4 |]\n"
        : "[V:r2] G,4 |]\n") +
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
  const plan = drawHymnFingerings(tune);
  return {
    status: plan.status,
    unchanged: before === signature(),
    soundingNotes: audio.tracks.flatMap((t) =>
      t.filter((n) => n.cmd === "note"),
    ).length,
    marks: [...document.querySelectorAll<SVGElement>(".hymn-fingering")].map(
      (mark) => ({
        hand: mark.dataset.hand,
        midi: Number(mark.dataset.midi),
        y: Number(mark.querySelector("text")?.getAttribute("y")),
        finger: Number(mark.dataset.finger),
        label: mark.getAttribute("aria-label"),
      }),
    ),
  };
}

import { hidePlaybackStaves } from "../src/hymn-playback-staves";
import { drawBeginnerFingerings } from "../src/beginner-score";
/** Real shared hidden-staff preparation, full-source planning and editorial path. */
export function renderPianoPracticeFixture(hidden = false, editorial = false) {
  document.body.innerHTML = '<div id="practice-fixture"></div>';
  const abc =
    "X:1\nM:4/4\nL:1/4\n%%score r h l\nV:r clef=treble\nV:h clef=treble\nV:l clef=bass\nK:C\n[V:r] CDEF |]\n[V:h] G,4 |]\n[V:l] C,D,E,F, |]";
  const full = abcjs.parseOnly(abc)[0];
  const audio = full.setUpAudio({ chordsOff: true });
  const tune = abcjs.renderAbc("practice-fixture", abc, {
    add_classes: true,
    staffwidth: 700,
    afterParsing: (t) => {
      if (hidden) hidePlaybackStaves(t, [1]);
      return t;
    },
  })[0];
  tune.setUpAudio({ chordsOff: true });
  if (editorial)
    drawBeginnerFingerings(
      tune,
      "piano",
      0,
      0,
      false,
      (_instrument, _bar, _voice, pitches) => pitches.map(() => 2),
    );
  else drawHymnFingerings(tune, { planningTune: full });
  const paper = document.getElementById("practice-fixture")!;
  return {
    generated: [...paper.querySelectorAll<SVGElement>(".hymn-fingering")].map(
      (e) => ({
        id: e.dataset.noteId,
        finger: e.dataset.finger,
        hand: e.dataset.hand,
        contact: e.dataset.contactId,
      }),
    ),
    editorial: [...paper.querySelectorAll(".beginner-fingering")].map(
      (e) => e.textContent,
    ),
    events: audio.tracks,
  };
}

export function renderPianoSubstitutionFixture() {
  document.body.innerHTML = '<div id="substitution-fixture"></div>';
  const tune = abcjs.renderAbc(
    "substitution-fixture",
    "X:1\nM:4/4\nL:1/4\n%%score (a b c)\nV:a clef=treble\nV:b clef=treble\nV:c clef=treble\nK:C\n[V:a] [CDEF] z3 |]\n[V:b] G3 z |]\n[V:c] z g z2 |]",
    { add_classes: true, staffwidth: 700 },
  )[0];
  tune.setUpAudio({ chordsOff: true });
  const plan = drawHymnFingerings(tune, {
    profile: { allowSubstitutions: true },
    fixedFinger: (e) =>
      e.midi === 79
        ? 5
        : e.start === 0 && e.midi !== 67
          ? [60, 62, 64, 65].indexOf(e.midi) + 1
          : undefined,
  });
  return {
    status: plan.status,
    substitutions: [
      ...document.querySelectorAll<SVGTextElement>(
        ".piano-finger-substitution",
      ),
    ].map((e) => ({
      beat: e.dataset.beat,
      text: e.textContent,
      label: e.getAttribute("aria-label"),
      x: Number(e.getAttribute("x")),
      y: Number(e.getAttribute("y")),
    })),
  };
}

/** Production-default physical fixes, and optional experimental routing. */
export function renderPianoErgonomicFixture(experimental = false) {
  document.body.innerHTML = '<div id="ergonomic-fixture"></div>';
  const t = abcjs.renderAbc(
    "ergonomic-fixture",
    "X:1\nM:4/4\nL:1/4\nK:C\n[Cc]2 || .D E |]",
    { add_classes: true, staffwidth: 700 },
  )[0];
  t.setUpAudio({ chordsOff: true });
  const before = JSON.stringify(
    t.lines.map((l) =>
      l.staff?.map((s) =>
        s.voices?.map((v) =>
          v
            .filter((n) => n.el_type === "note")
            .map((n) => ({ duration: n.duration, pitches: n.pitches })),
        ),
      ),
    ),
  );
  const p = drawHymnFingerings(t, {
    profile: { model: experimental ? "ergonomic" : "classic" },
    fixedFinger: (e) => (e.midi === 60 ? 1 : e.midi === 72 ? 4 : undefined),
  });
  const after = JSON.stringify(
    t.lines.map((l) =>
      l.staff?.map((s) =>
        s.voices?.map((v) =>
          v
            .filter((n) => n.el_type === "note")
            .map((n) => ({ duration: n.duration, pitches: n.pitches })),
        ),
      ),
    ),
  );
  return {
    status: p.status,
    unchanged: before === after,
    notes: p.notes.map((n) => ({
      midi: n.midi,
      finger: n.finger,
      hold: n.duration,
      notation: n.notatedDuration,
      voice: n.voice,
      phraseStart: !!n.phraseStart,
    })),
    marks: [...document.querySelectorAll<SVGElement>(".hymn-fingering")].map(
      (e) => ({
        midi: Number(e.dataset.midi),
        finger: Number(e.dataset.finger),
      }),
    ),
  };
}
