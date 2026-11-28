import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import extension from "../../../packages/music-practice/src/assets/songalong-guitar/manifest.json";
import audit from "../../../packages/music-practice/src/assets/songalong-guitar/source-sha256.json";
import shared from "../../../packages/music-practice/src/assets/backing-folk-country/manifest.json";

test("all six strings have three real recorded dynamics through fret 20, without duplicated shared entries",()=>{
  const samples=[...Object.values(shared.samples).filter(s=>s.instrument==="acoustic-steel").map(s=>({string:(s as typeof s & {string:number}).string,pitch:s.note,layer:s.velocity})),...extension.samples];
  const keys=samples.map(s=>`${s.string}:${s.pitch}:${s.layer}`);
  assert.equal(new Set(keys).size,378);assert.equal(keys.length,378);
  for(const [string,open] of [40,45,50,55,59,64].entries())for(let fret=0;fret<=20;fret++)for(const layer of [40,72,104])
    assert(keys.includes(`${string}:${open+fret}:${layer}`),`missing string ${string} fret ${fret} layer ${layer}`);
  assert.equal(extension.license,"CC0-1.0");
  assert.equal(audit.revision,"514c926efecdb3c7812bf00eedf8e5c8d61dd681");
  for(const s of extension.samples){
    const a=audit.files.find(a=>a.file===s.file);assert(a);assert.match(a.sourceSha256,/^[0-9a-f]{64}$/);
    const bytes=readFileSync(new URL(`../../../packages/music-practice/src/assets/songalong-guitar/${s.file}`,import.meta.url));
    assert.equal(bytes.subarray(0,4).toString(),"fLaC");
    assert.equal(bytes.readUInt16BE(8),4096,"minimum block size matches the WebKit-compatible reference bank");
    assert.equal(bytes.readUInt16BE(10),4096,"maximum block size matches the WebKit-compatible reference bank");
    assert.equal(createHash("sha256").update(bytes).digest("hex"),a.sha256);
    assert.equal(a.sourcePitch,s.string===0&&s.pitch===47?46:s.pitch,"only the documented missing source pitch is transposed");
  }
});
