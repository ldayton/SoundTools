const {test,expect}=require('@playwright/test');
test('Voice Tools preserves established pitch values after raw history pruning',async({page},info)=>{
 test.skip(info.project.name!=='desktop','One real-time pruning run is sufficient; numerical grouping cases are viewport independent');test.setTimeout(60000);
 await page.setViewportSize({width:1280,height:900});await page.goto('/dist/index.html#settings');await page.getByRole('tab',{name:'Pitch',exact:true}).click();await page.locator('#pitchPreset').selectOption('voice');
 await page.evaluate(()=>{
  const original=FeatureState.points,all=new Map();window.prunedPitchChecks={checks:0,error:null};
  FeatureState.points=(rows,p,seed)=>{
   if(p.samplingMs===100&&p.aggregation==='continuity'){
    for(const row of rows)all.set(row.time,row);
    const actual=original(rows,p,seed);
    if(seed){
     const referenceRows=[...all.values()].filter(row=>row.time<=(rows.at(-1)?.time??0)).sort((a,b)=>a.time-b.time);
     const expected=new Map(original(referenceRows,p).map(point=>[point.time,point]));
     for(const point of actual){
      if(point.time<(rows[0]?.time??0)+.11)continue;
      const reference=expected.get(point.time);
      if(!reference||Math.abs(point.hz-reference.hz)>1e-8||point.connected!==reference.connected)if(!window.prunedPitchChecks.error)window.prunedPitchChecks.error={point,reference,seed,first:rows[0],referenceSeed:FeatureState.groupSeed(referenceRows.filter(row=>row.time<rows[0].time),p)};
     }window.prunedPitchChecks.checks++;
    }return actual;
   }return original(rows,p,seed);
  };
 });
 await page.locator('#demo').click();await page.waitForFunction(()=>Number(canvas.dataset.plottedUntil)>33,undefined,{timeout:45000});
 const result=await page.evaluate(()=>prunedPitchChecks);expect(result.checks).toBeGreaterThan(20);expect(result.error).toBeNull();
 await expect(page.locator('#pitchPreset')).toHaveValue('voice');await expect(page.locator('#state')).toHaveText('EXAMPLE');
});
