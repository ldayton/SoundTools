const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
test('long retained history is prepared before the atomic settings commit',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='desktop','One full-retention benchmark; other projects exercise continuity separately.');
 test.setTimeout(120000);await page.setViewportSize({width:811,height:1356});await page.goto('/dist/index.html');await page.locator('#demo').click();
 await page.waitForFunction(()=>Number(canvas.dataset.plottedUntil)>32,null,{timeout:45000});
 await page.evaluate(()=>{
  performanceSession.enabled=true;performanceSession.reset();
  window.commitLevelMisses=0;window.commitCount=0;let committing=false;
  const get=levelCache.get.bind(levelCache);levelCache.get=(frame,preemphasis)=>{
   const before=levelCache.frames.get(frame.power),result=get(frame,preemphasis);
   if(committing&&result!==before)commitLevelMisses++;return result;
  };
  const commit=engine.onReconfigured;engine.onReconfigured=groups=>{committing=true;try{return commit(groups)}finally{committing=false;commitCount++}};
 });
 await page.locator('#openSettings').click();await page.locator('#scale').selectOption('linear');
 for(const windowSeconds of ['0.04','0.015']){
  await page.locator('#window').selectOption(windowSeconds);
  await page.waitForFunction(seconds=>!engine.rebuild&&engine.activeSettings.windowSeconds===Number(seconds),windowSeconds);
 }
 expect(await page.evaluate(()=>commitCount)).toBe(2);
 expect(await page.evaluate(()=>commitLevelMisses),'A history commit must not recalculate retained spectral levels').toBe(0);
 expect(await page.evaluate(()=>spectrumHistory.frames.at(-1).time-spectrumHistory.frames[0].time)).toBeGreaterThan(30);
 const end=await page.locator('#spectrogram').getAttribute('data-plotted-until');
 await page.waitForFunction(end=>Number(canvas.dataset.plottedUntil)>Number(end)+.5,end);
 expect(await page.evaluate(()=>processingStats.discontinuousBatches||0)).toBe(0);
 expect(await page.evaluate(()=>running&&!paused&&assertSettingsConsistent())).toBe(true);
 const report=await page.evaluate(()=>soundglowPerformance.report());
 expect(report.metrics.historyCommitMs.count).toBe(2);
 fs.mkdirSync(testInfo.outputDir,{recursive:true});fs.writeFileSync(testInfo.outputPath('retained-history-performance.json'),JSON.stringify(report,null,2));
});
