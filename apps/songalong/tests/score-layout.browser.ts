import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {launchBrowser,newPage,captureFailure,closeBrowser,browserName} from '../../../scripts/ci/browser-harness.cjs';
import {prepareScoreLayoutFixture} from '../../../packages/music-practice/browser-tests/score-layout';
import {compareLayoutPng,layoutImageChanged,checkLayoutImageComparator} from '../../../packages/music-practice/browser-tests/score-layout-images';
import {qualityViolations} from '../../../packages/music-practice/browser-tests/score-layout-quality';
import {layoutVisualCases} from '../../../packages/music-practice/test-fixtures/score-layout';

const candidates=process.argv.includes('--record-candidates');
assert(!candidates||!process.env.CI,'CI cannot generate baseline candidates');
const engine=browserName();
const baseline=new URL(`../../../packages/music-practice/test-fixtures/score-layout-baselines/${process.platform}/${engine}/`,import.meta.url);
const parent=path.resolve(process.env.CI_ARTIFACTS||'work/browser-results');await mkdir(parent,{recursive:true});
const output=await mkdtemp(path.join(parent,`score-layout-${engine}-`));
const browser=await launchBrowser();
try {
  const page=await newPage(browser,{viewport:{width:1000,height:1000},deviceScaleFactor:1});
  const provenance=await prepareScoreLayoutFixture(page);
  const metadata={...provenance,engine,browser:browser.version(),platform:process.platform,dpr:1,
    sourceState:process.env.GITHUB_SHA?'explicit CI/private snapshot revision':(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()?'dirty':'clean'),
    commit:process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),generated:new Date().toISOString()};
  assert.deepEqual(await checkLayoutImageComparator(page),{dimensionCrop:true,identical:false,onePixel:false,moved:true,removed:true,whitespace:true},'Independent image mutations verify comparator sensitivity');
  let approved:any;
  if(!candidates) {
    approved=JSON.parse(await readFile(new URL('manifest.json',baseline),'utf8'));
    assert.equal(approved.reviewed,true,'Baselines require an explicit visual review');
    assert.deepEqual(approved.records.map((record:any)=>record.id),layoutVisualCases.map(fixture=>fixture.id),'Baseline registry is complete');
    for(const key of ['engine','browser','fontSha256','dpr','platform'] as const)assert.equal(metadata[key],approved[key],`Baseline environment: ${key}`);
  }
  const records:any[]=[];
  for(const fixture of layoutVisualCases) {
    const rendered=await page.evaluate(f=>window.ScoreLayoutFixture.renderLayoutFixture(f.width,f.kind),fixture);
    const quality=await page.evaluate(()=>window.ScoreLayoutFixture.measureLayoutQuality());
    const violations=qualityViolations(quality);
    const actual=await page.locator('#layout-fixture').screenshot({animations:'disabled'});
    await writeFile(path.join(output,`${fixture.id}.png`),actual);
    // Full contours are retained as inspectable artifacts, rather than
    // duplicating thousands of non-asserted points in approved manifests.
    await writeFile(path.join(output,`${fixture.id}-geometry.json`),JSON.stringify(rendered.diagnostics,null,2));
    const diagnostics={...rendered.diagnostics,vertical:rendered.diagnostics.vertical.map(({contours:_contours,...summary})=>summary)};
    const record:any={...fixture,imageSha256:createHash('sha256').update(actual).digest('hex'),quality,violations,diagnostics,systems:rendered.plan?.sections.map(section=>section.breaks)};
    if(!candidates) {
      const expected=await readFile(new URL(`${fixture.id}.png`,baseline));
      assert.equal(createHash('sha256').update(expected).digest('hex'),approved.records.find((record:any)=>record.id===fixture.id).imageSha256,'Approved baseline integrity');
      const diff=expected.equals(actual)?null:await compareLayoutPng(page,expected,actual);
      if(diff) {
        await writeFile(path.join(output,`${fixture.id}-expected.png`),expected);
        for(const [key,suffix] of [['diff','diff'],['beforeCrop','before-crop'],['afterCrop','after-crop'],['diffCrop','diff-crop']] as const)
          if(diff[key])await writeFile(path.join(output,`${fixture.id}-${suffix}.png`),Buffer.from(diff[key],'base64'));
        record.comparison={changed:diff.changed,inkPixels:diff.inkPixels,region:diff.region,expectedSize:diff.expectedSize,actualSize:diff.actualSize};
      }
      // Counts are relative to ink, not total page area: whitespace cannot hide
      // a significant glyph change. Geometry and image dimensions are independent gates.
      record.failed=!!diff&&layoutImageChanged(diff);
    }
    records.push(record);
  }
  await writeFile(path.join(output,'manifest.json'),JSON.stringify({...metadata,reviewed:false,records},null,2));
  await writeFile(path.join(output,'index.html'),`<!doctype html><meta charset="utf-8"><title>Score layout review</title><style>body{font:14px sans-serif}img{max-width:100%;border:1px solid #ccc}section{margin:24px 0}div{display:flex;gap:12px;align-items:start}figure{margin:0}figcaption{padding:8px}</style><h1>${engine} score layout ${candidates?'candidates':'comparison'}</h1><pre>${JSON.stringify(metadata,null,2)}</pre>`+records.map(r=>`<section><h2>${r.id}${r.failed?' — CHANGED':''}</h2><img src="${r.id}.png"><pre>${JSON.stringify(r.quality,null,2)}</pre>${r.comparison?.region?`<div><figure><figcaption>Before</figcaption><img src="${r.id}-before-crop.png"></figure><figure><figcaption>After</figcaption><img src="${r.id}-after-crop.png"></figure><figure><figcaption>Difference</figcaption><img src="${r.id}-diff-crop.png"></figure></div>`:''}</section>`).join(''));
  console.log(`${candidates?'CANDIDATES ONLY — not a test pass':'Score layout comparison'}: ${output}`);
  assert(!records.some(record=>record.violations.length),'Space-quality regression; inspect the retained metrics');
  if(!candidates)assert(!records.some(record=>record.failed),'Visual layout regression; inspect the retained before/after crops');
} catch(error) {
  await captureFailure(browser,error,path.join(output,'failure'));throw error;
} finally {await closeBrowser(browser);}
