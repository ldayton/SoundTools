const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {plan,independentChecks,matrix}=require('../../scripts/ci/test-strategy.cjs');
const {leaves,declaration}=require('../../scripts/ci/inventory.cjs');
const {commandTasks}=require('../../scripts/ci/task-graph.cjs');
const {balanced,estimate}=require('../../scripts/ci/duration-plan.cjs');
const {collect}=require('../../scripts/ci/failure-artifacts.cjs');
function files(commands){return commands.flatMap(([command,args])=>leaves(command,args)).map(x=>{
  if(x.command==='npm'&&x.args[0]==='exec'){const [command,...args]=x.args.slice(x.args.indexOf('--')+1);return {command,args,cwd:x.cwd};}return x;
}).map(x=>JSON.stringify(x)).sort();}
test('independent Nightly checks retain every ordered alias leaf exactly once and preserve reviewed resources',()=>{
  for(const [app,names] of Object.entries({songalong:['test:sight','test:hymn-playback','test:hymn-keys'],notewise:['test:guitar','test:backing','test:backing-genres']})){
    const original=names.map(name=>['npm',['run',name,'--workspace='+app]]);
    const split=independentChecks(app,original);
    assert.deepEqual(files(split),files(original));
    assert.equal(new Set(files(split)).size,files(split).length);
    for(const [command,args] of split){
      assert(plan(app,'nightly').some(c=>JSON.stringify(c)===JSON.stringify([command,args])));
      const resource=declaration(app,command,args);
      assert.equal(resource.coverage.length,1);
      assert(resource.locks.every(lock=>original.some(c=>declaration(app,...c).locks.includes(lock))));
    }
  }
});
test('duration balancing is deterministic, bounded, covers unknown/new checks and rejects invalid estimates',()=>{
  const work=[9,8,7,6,5,4,3,2,1];
  const shards=balanced(work,3,x=>x);
  assert.deepEqual(shards,balanced(work,3,x=>x));
  assert.deepEqual(shards.flat().sort((a,b)=>a-b),[...work].sort((a,b)=>a-b));
  assert(shards.every(shard=>shard.length===3));
  assert(Math.max(...shards.map(s=>s.reduce((a,b)=>a+b,0)))<=17);
  assert.equal(estimate('unknown','webkit','node',['new-test.cjs']),60);
  assert.throws(()=>balanced([1],2,x=>x),/Invalid/);
  assert.throws(()=>balanced([1],1,()=>NaN),/Invalid/);
});
test('both required core shards retain all tests, catalog partitions, ports and audio locks exactly once',()=>{
  for(const browser of ['chromium','webkit']){
    const rows=matrix('songalong','nightly').include.filter(row=>row.group==='core'&&row.browser===browser);
    assert.equal(rows.length,2);
    assert(rows.every(row=>row.timeout===30&&row.shards===2));
    const original=commandTasks('songalong','nightly',browser);
    const split=rows.flatMap(row=>commandTasks('songalong','nightly',browser,undefined,{shard:`${row.shard}/${row.shards}`}));
    const signature=task=>JSON.stringify([task.command,task.args,[...task.locks].sort(),task.partition]);
    assert.deepEqual(split.map(signature).sort(),original.map(signature).sort());
    assert.equal(new Set(split.map(task=>task.id)).size,split.length);
  }
  assert.throws(()=>commandTasks('songalong','ci','webkit',undefined,{shard:'1/2'}),/Only/);
  assert.throws(()=>commandTasks('notewise','nightly','webkit',undefined,{shard:'1/2'}),/Only/);
});
test('failure bundles retain diagnostics and PCM, excluding generated offline builds, credentials and symlinks',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'failure-bundle-'));
  const put=(file,text='evidence')=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text);};
  try{
    for(const file of ['apps/notewise/work/browser-results/case/error.txt','work/browser-results/case/page-0-0.json','apps/notewise/work/measure/result.wav','apps/notewise/test-results/case/trace.zip'])put(file);
    for(const file of ['apps/notewise/work/offline-release-a/assets/huge.flac','apps/notewise/work/offline-release-a/release.json','apps/notewise/work/ci-vite-cache/x/cache.json','apps/notewise/work/account-local-status.json','apps/notewise/work/.env','apps/notewise/work/measure/assets/large.json'])put(file,'excluded');
    fs.symlinkSync(path.join(root,'apps/notewise/work/.env'),path.join(root,'apps/notewise/work/link.json'));
    const dest=collect(root,'notewise');
    const manifest=JSON.parse(fs.readFileSync(path.join(dest,'manifest.json')));
    assert.equal(manifest.files.length,4);
    assert(manifest.files.every(file=>!file.path.includes('offline-release')));
    assert.equal(fs.readFileSync(path.join(dest,'apps/notewise/work/measure/result.wav'),'utf8'),'evidence');
    assert.throws(()=>collect(root,'notewise'),/already exists/);
    assert.throws(()=>collect(root,'../private'),/Unknown/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('duration refresh ignores failed runs and non-Linux timings and keys evidence by command, not mutable task index',()=>{
  const {refresh}=require('../../scripts/ci/refresh-durations.cjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'duration-evidence-'));
  try{
    for(const [id,passed,platform,elapsedMs] of [['valid',true,'linux',1234],['failed',false,'linux',99999],['mac',true,'darwin',99999]]){
      const dir=path.join(root,id);fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir,'inventory.json'),JSON.stringify({app:'songalong',browser:'webkit',platform,tasks:[{id:'songalong:nightly:core:webkit:1',command:'npm',args:['exec','--workspace=songalong','--','tsx','tests/new.browser.ts']}]}));
      fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({passed,results:[{id:'songalong:nightly:core:webkit:1',status:'success',elapsedMs}]}));
    }
    const result=refresh(root,{fallbackSeconds:60,seconds:{}});
    assert.deepEqual(Object.values(result.seconds),[2]);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('failure summaries identify the first command and retain original evidence without leaking private logs',()=>{
 const {recordFailure}=require('../../scripts/ci/failure-summary.cjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'failure-summary-'));
 try{
  const log=path.join(root,'test.log');fs.writeFileSync(log,'Starting\nAssertionError: volume 35 instead of zero\nhttps://x.test/?access_token=secret');
  const task={id:'example',command:'node',args:['test.cjs'],locks:['realtime-audio']};
  const report=recordFailure(root,{sha:'exact-sha',tasks:[task]},{id:'example',status:'failure',exitCode:1,log});
  assert.match(report.excerpt,/volume 35/);assert(!report.excerpt.includes('secret'));
  assert.deepEqual(report.locks,['realtime-audio']);assert.equal(report.sha,'exact-sha');
  assert.throws(()=>recordFailure(root,{tasks:[task]},{id:'example',log}),/EEXIST/);
  const privateReport=recordFailure(root,{tasks:[{...task,id:'private',privateLogDirectory:root}]},{id:'private',log});
  assert.equal(privateReport.excerpt,'Private backend log retained locally.');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('both teacher-edition partitions retain every viewport once on isolated ports and caches',()=>{
  const {widths}=require('../../apps/songalong/tests/in-christ-alone-layout-cases.cjs');
  const {partition}=require('../../scripts/ci/shard.cjs');
  assert.deepEqual(widths,[1960,1440,768,390,320]);
  const all=[];
  for(const browser of ['chromium','webkit']){
    const tasks=commandTasks('songalong','nightly',browser,undefined,{group:'editions'}).filter(t=>t.args.at(-1)==='tests/in-christ-alone-editions.browser.ts');
    assert.equal(tasks.length,2);
    assert.deepEqual(tasks.map(t=>t.partition),[{index:1,total:2},{index:2,total:2}]);
    const cases=tasks.flatMap(t=>partition(widths,t.env.TEST_SHARD));
    assert.deepEqual([...cases].sort((a,b)=>a-b),[...widths].sort((a,b)=>a-b));
    assert.equal(new Set(cases).size,widths.length);
    assert(tasks.every(t=>!t.locks.includes('port:4615')));
    all.push(...tasks);
  }
  assert.equal(new Set(all.map(t=>t.env.TEST_PORT)).size,4);
  assert.equal(new Set(all.map(t=>t.env.CI_VITE_CACHE_DIR)).size,4);
});
test('real cached-startup latency has one exclusive Nightly owner on both engines',()=>{
  for(const browser of ['chromium','webkit']){
    const tasks=commandTasks('notewise','nightly',browser);
    const latency=tasks.filter(t=>t.args.at(-1)==='tests/offline-startup.browser.ts');
    assert.equal(latency.length,1);
    assert.equal(latency[0].slots,32);
    assert(latency[0].locks.includes('realtime-audio'));
    assert(!commandTasks('notewise','ci',browser).some(t=>t.args.at(-1)==='tests/offline-startup.browser.ts'));
  }
});
