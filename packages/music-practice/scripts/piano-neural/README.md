# Isolated pretrained comparison

See `docs/piano-neural-comparison.md` for the decision, limitations, rights review
and test ownership. These commands never train models or change the app.

Use Node 24 and an interpreter with PyTorch 2.11.0. For example, set
`PIANO_PYTHON=/absolute/path/to/your/venv/bin/python`. Keep these dependencies and
artifacts outside the product packages. Review `artifacts.json` and the model
licensing discussion before downloading. `fetch.py` retrieves only the eight
pinned weight/ONNX files and requires their recorded hashes; no dataset or
upstream program is downloaded or executed by that recipe.

From the repository root:

```sh
mkdir -p work/neural-piano
cp packages/music-practice/scripts/piano-neural/protocol.json work/neural-piano/protocol.json
python3 packages/music-practice/scripts/piano-neural/fetch.py work/neural-piano/upstream
npx tsx packages/music-practice/scripts/piano-neural/prepare.ts work/neural-piano/requests.json

for model in lumikey argnn arlstm; do
  "$PIANO_PYTHON" packages/music-practice/scripts/piano-neural/infer.py \
    work/neural-piano/requests.json work/neural-piano/upstream \
    "work/neural-piano/$model.json" --model "$model"
done
for model in argnn arlstm; do
  "$PIANO_PYTHON" packages/music-practice/scripts/piano-neural/infer.py \
    work/neural-piano/requests.json work/neural-piano/upstream \
    "work/neural-piano/$model-pig.json" --model "$model" --pitch-shift -12
done

"$PIANO_PYTHON" packages/music-practice/scripts/piano-neural/test_infer.py
npx tsx --test packages/music-practice/tests/piano-neural-comparison.test.ts
npx tsx packages/music-practice/scripts/piano-neural/evaluate.ts \
  work/neural-piano work/neural-piano/results-all.json
```

For independent ONNX/PyTorch comparison and desktop browser timing:

```sh
npm install --prefix work/neural-piano/runtime --ignore-scripts --no-audit --no-fund onnxruntime-web@1.23.2
"$PIANO_PYTHON" packages/music-practice/scripts/piano-neural/probe.py work/neural-piano
TEST_BROWSER=chromium npx tsx packages/music-practice/scripts/piano-neural/browser.mts work/neural-piano
TEST_BROWSER=webkit npx tsx packages/music-practice/scripts/piano-neural/browser.mts work/neural-piano
```

The browser probe uses the shared silent harness and a temporary loopback server
on an OS-assigned port. It requires actual model completion and numeric agreement,
not a fixed wait. Neither hardware sound nor remote/CDN requests are involved.

No recipe overwrites the reviewed report. Save new experiments to ignored work
files and compare their evidence before updating any committed decision. Beam
width is fixed at six in the adapters. These tools reject incomplete model output,
changed identities, invalid digits, broken ties and source-anchor changes.

## Hybrid ranking

Human review is not required. See `docs/piano-hybrid-ranking.md` and the frozen
`hybrid-protocol.json` for the fixed objective, automated gates and full results.
Reuse the verified original Lumikey beam output; score the classic candidate
under its own finger history before ranking:

```sh
npx tsx packages/music-practice/scripts/piano-neural/hybrid-prepare.ts \
  work/neural-piano work/neural-piano-hybrid
"$PIANO_PYTHON" packages/music-practice/scripts/piano-neural/score_hybrid.py \
  work/neural-piano-hybrid/requests.json work/neural-piano/upstream \
  work/neural-piano-hybrid/scores.json
npx tsx packages/music-practice/scripts/piano-neural/hybrid-evaluate.ts \
  work/neural-piano work/neural-piano-hybrid work/neural-piano-hybrid/results-v3.json --v3
```

Use a new directory for a new experiment; preparation refuses to overwrite the
frozen requests. For a replay, keep the frozen inputs and rerun the evaluator.
The baseline candidate has an invalid placeholder likelihood before Python
scoring; passing it directly to the ranker intentionally fails. Full candidate
audits for v3 stay in `work/neural-piano-hybrid/audit-hybrid-ranking-3.json`;
`audit.json` retains the original v1 run. The corrected report is
`docs/piano-hybrid-v3-results.json`; the original v1
report remains unchanged. The evaluator defaults to the strict v3 guard; use
`--v1`/`--v2` explicitly for historical trials. V3 admits a neural change only
when it reduces at least one movement-complexity count and increases none.
The reports include per-case metrics, source/input/weight hashes and every gate.
