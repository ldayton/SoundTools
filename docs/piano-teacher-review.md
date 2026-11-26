# Blind piano fingering review PFR1

Status: packets prepared; no teacher judgments collected. The production planner
remains unchanged. This study follows the [pretrained comparison](piano-neural-comparison.md).

Eight four-block product excerpts, containing 209 source note occurrences, were
frozen before inference at source revision `6a6398e2`. The selection covers two
right-hand melodies, held chords, ties, moving accompaniment and two endings.
The Voice + Piano excerpt retains the keyboard voices and removes only the singer.
No product music was rewritten. Each excerpt is planned independently at quarter
note = 60, retaining its written rhythm, hand ownership, ties and swing marking.

These excerpts are new to this neural comparison, not proven unseen training
material. Product music was previously inspected and feasibility-tested; pretrained
training overlap is unknown. No teacher reference labels exist for this selection.
Preparation checks that none exactly duplicates a passage in the prior corpus.

## Review procedure

1. Give the teacher the independent packet first, with a learner experience/reach
   profile. Ask for a coherent fingering without seeing algorithm proposals.
2. Then give the comparison packet. Ask the teacher to try each A/B/C version,
   rate comfort, consistency and beginner suitability, choose a preference and
   mark specific corrections. Ties, None and N/A are valid responses.
3. Keep the organizer key separate until both marked packets are returned.
   Labels are reassigned per passage. Some proposals are identical; the key
   records those pairs. These are paired observations, not 24 independent samples.
4. Retain the independent first response unchanged. Report each passage and hand,
   failures and disagreements, rather than just an overall preference count.
   Do not tune against these responses and subsequently call them a fresh test.

The proposals are the current classic planner, Lumikey beam six, and the existing
constrained six-candidate shortlist with classic fallback. Weights and policy
are unchanged. All eight cases have complete proposals from all three methods.
A seed shuffles the six label permutations and cycles them; the first six passages
therefore balance each method in each position. Existing assignments are reused
when regenerating presentation. Raw predictions are printed directly, without
silently replacing them with classic digits. Every score is parsed again and its
note identity, hand, pitch, onset and duration checked against the frozen passage.

## Reproduction

Use Node 24, the repository dependencies, and the isolated Python/PyTorch runtime
described in the neural scripts' README. From the repository root:

```sh
npx tsx packages/music-practice/scripts/piano-neural/teacher-prepare.ts work/piano-teacher
"$PIANO_PYTHON" packages/music-practice/scripts/piano-neural/infer.py \
  work/piano-teacher/requests.json work/neural-piano/upstream \
  work/piano-teacher/lumikey.json --model lumikey
npx tsx packages/music-practice/scripts/piano-neural/teacher-proposals.ts work/piano-teacher
npx tsx packages/music-practice/scripts/piano-neural/teacher-packet.mts \
  work/piano-teacher output/pdf/piano-fingering-review
"$PDF_PYTHON" packages/music-practice/scripts/piano-neural/teacher-validate.py \
  work/piano-teacher output/pdf/piano-fingering-review
```

`PIANO_PYTHON` needs PyTorch; `PDF_PYTHON` needs pypdf. Preparation requires the
recorded music/planner sources and refuses to overwrite frozen passages. To
redraw an existing packet, rerun only the packet and PDF validation steps; do not
regenerate inference or assignments. A new study needs a new ID and directory.
Keep the frozen passages, inference, private organizer seed/key, anonymous payload
and validation JSON together in the ignored work directory. PDF bytes may differ
on regeneration because timestamps and internal document IDs are generated.

The generator uses the shared silent Chromium harness and checks page count,
footer clearance, clipped fingering labels, anonymous text and editable fields.
The independent pypdf validator checks field/widget identity, blank responses,
appearance streams, bounds and a disposable filled copy. Render the actual PDFs
with Poppler and inspect every page after any presentation change. In this run,
the independent and comparison packets have nine pages and 12/100 editable text
fields respectively; the separate key has one page. Writing digits on the staff
still requires printing or a PDF annotation tool.

`piano-teacher-review.test.ts` is owned by the existing shared/music unit glob.
It covers balanced blinding and preservation of musical events while removing
the singer or native digits. The optional model/PDF experiment has no new CI
lane or production dependency. No behavior was displaced from CI or Nightly.

Initial diagnostics exposed a test comparing source character offsets rather
than musical events, a pdf-lib font-size call before field appearance creation,
and abcjs wrappers clipping new low-hand labels. Those were corrected at their
owners. Actual page overflow was fixed by removing redundant score annotations
equally, resizing the music and review boxes, and reserving annotation bounds;
the generator now checks clearance against the actual footer. No musical output,
assertion tolerance, timeout or model policy was changed to obtain a pass.
