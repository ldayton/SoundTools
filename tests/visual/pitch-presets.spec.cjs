const {test,expect}=require('@playwright/test');
const settings=async page=>{const b=page.locator(await page.locator('#openSettings').isVisible()?'#openSettings':'#settings');if(await b.getAttribute('aria-expanded')!=='true')await b.click()};
test('pitch presets use editable trace settings, preserve audio, and save independently',async({page},info)=>{
 if(info.project.name==='desktop')await page.setViewportSize({width:1280,height:900});
 await page.goto('/dist/index.html');await page.getByRole('tab',{name:'Pitch',exact:true}).click();await page.locator('#demo').click();await page.waitForFunction(()=>Number(document.getElementById('pitchCanvas').dataset.voiced)>20);await settings(page);
 await page.evaluate(()=>{window.pitchTransport={engine,audio,source};window.spectrogramPreset=settingsState.selected});
 await page.locator('#pitchPreset').selectOption('soundglow');await page.locator('#advancedPitchTrace > summary').click();
 await expect(page.locator('#pitchSampling')).toHaveValue('100');await expect(page.locator('#pitchCorners')).toHaveValue('20');await expect(page.locator('#pitchGap')).toHaveValue('200');await expect(page.locator('#pitchSmoothing')).toHaveValue('off');
 expect(await page.evaluate(()=>Object.entries(pitchTransport).every(([key,value])=>({engine,audio,source})[key]===value)&&settingsState.selected===spectrogramPreset)).toBe(true);
 await page.locator('#pitchCorners').fill('15');await page.locator('#pitchCorners').dispatchEvent('change');await expect(page.locator('#pitchPreset option:checked')).toHaveText('Unnamed Preset*');
 await page.locator('#editPitchPreset').click();await page.locator('#pitchPresetName').fill('Praat');await page.locator('#pitchPresetForm button[type=submit]').click();await expect(page.locator('#pitchPresetStatus')).toContainText('unique');
 await page.locator('#pitchPresetName').fill('My pitch');await page.locator('#pitchPresetForm button[type=submit]').click();await expect(page.locator('#pitchPresetDialog')).not.toHaveAttribute('open','');
 const id=await page.locator('#pitchPreset').inputValue();await page.locator('#pitchHistory').fill('8');await page.locator('#pitchHistory').dispatchEvent('change');await expect(page.locator('#pitchPreset')).toHaveValue(id);
 await page.reload();await settings(page);await expect(page.locator('#pitchPreset')).toHaveValue(id);await expect(page.locator('#pitchHistory')).toHaveValue('8');
 await page.locator('#editPitchPreset').click();await page.locator('#pitchPresetName').fill('Renamed');await page.locator('#pitchPresetForm button[type=submit]').click();await expect(page.locator('#pitchPreset option:checked')).toHaveText('Renamed');
 await page.locator('#editPitchPreset').click();await page.locator('#deletePitchPreset').click();await expect(page.locator('#pitchPreset')).toHaveValue('soundglow');await expect(page.locator('#pitchHistory')).toHaveValue('10');
});
test('Praat pitch preset uses source-derived drawing defaults without restarting audio',async({page},info)=>{
 if(info.project.name==='desktop')await page.setViewportSize({width:1280,height:900});
 await page.goto('/dist/index.html');await page.getByRole('tab',{name:'Pitch',exact:true}).click();await page.locator('#demo').click();await page.waitForFunction(()=>Number(document.getElementById('pitchCanvas').dataset.voiced)>20);await settings(page);
 await page.evaluate(()=>window.praatPitchTransport={engine,audio,source});await page.locator('#pitchPreset').selectOption('praat');
 await expect(page.locator('#pitchMinimum')).toHaveValue('50');await expect(page.locator('#pitchMaximum')).toHaveValue('800');await expect(page.locator('#pitchAxis')).toHaveValue('log');await expect(page.locator('#pitchBands')).not.toBeChecked();
 await page.locator('#advancedPitchTrace > summary').click();await expect(page.locator('#pitchDrawing')).toHaveValue('auto');await expect(page.locator('#pitchEdges')).toHaveValue('half-frame');await expect(page.locator('#pitchCorners')).toHaveValue('0');await expect(page.locator('#pitchJumps')).toHaveValue('0');await expect(page.locator('#pitchConfidence')).toHaveValue('0');
 expect(await page.evaluate(()=>Object.entries(praatPitchTransport).every(([key,value])=>({engine,audio,source})[key]===value))).toBe(true);
 await page.locator('#pitchDrawing').selectOption('dots');await expect(page.locator('#pitchPreset option:checked')).toHaveText('Unnamed Preset*');
 await page.locator('#pitchPreset').selectOption('praat');await page.reload();await settings(page);await expect(page.locator('#pitchPreset')).toHaveValue('praat');await expect(page.locator('#pitchAxis')).toHaveValue('log');
});
test('applying a pitch preset clears stale validation errors',async({page},info)=>{
 if(info.project.name==='desktop')await page.setViewportSize({width:1280,height:900});
 await page.goto('/dist/index.html#settings');await page.getByRole('tab',{name:'Pitch',exact:true}).click();
 for(const [minimum,preset] of [['500','soundglow'],['600','praat']]){
  await page.locator('#pitchMinimum').fill(minimum);await page.locator('#pitchMinimum').dispatchEvent('change');await expect(page.locator('#pitchError')).toBeVisible();
  await page.locator('#pitchPreset').selectOption(preset);await expect(page.locator('#pitchError')).toBeHidden();await expect(page.locator('#pitchMinimum')).toHaveValue('50');
 }
});

test('settings return control follows the active feature across viewport changes',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await page.goto('/dist/index.html#settings');
 await page.getByRole('tab',{name:'Pitch',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('#settings')).toHaveAttribute('aria-label','Return to pitch');
 await expect(page.locator('#settings')).toHaveAttribute('title','Return to pitch');
 await page.setViewportSize({width:1280,height:900});
 await expect(page.locator('#settings')).toHaveAttribute('aria-label','Close settings');
 await page.getByRole('tab',{name:'Spectrogram',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('#settings')).toHaveAttribute('aria-label','Return to spectrogram');
});

test('Soundglow speech filtering and bounded confirmation remain editable without restarting playback',async({page},info)=>{
 if(info.project.name==='desktop')await page.setViewportSize({width:1280,height:900});
 await page.goto('/dist/index.html');await page.getByRole('tab',{name:'Pitch',exact:true}).click();await page.locator('#demo').click();
 await page.waitForFunction(()=>Number(document.getElementById('pitchCanvas').dataset.voiced)>10);
 await settings(page);await page.locator('#advancedPitchTrace > summary').click();
 expect(await page.locator('#pitchPreset option').evaluateAll(options=>options.map(o=>o.value))).toEqual(['soundglow','praat']);
 await expect(page.locator('#pitchSpeechGate')).toBeChecked();await expect(page.locator('#pitchConfirmation')).toHaveValue('50');
 await page.evaluate(()=>{window.policyTransport={engine,audio,source,pcmNode}});
 await page.locator('#pitchSpeechGate').uncheck();await expect(page.locator('#pitchPreset')).toHaveValue('custom');await page.locator('#pitchConfirmation').selectOption('0');
 await page.locator('#pitchPreset').selectOption('praat');await expect(page.locator('#pitchSpeechGate')).not.toBeChecked();await expect(page.locator('#pitchConfirmation')).toHaveValue('0');
 await page.locator('#pitchPreset').selectOption('soundglow');await expect(page.locator('#pitchSpeechGate')).toBeChecked();
 expect(await page.evaluate(()=>Object.entries(policyTransport).every(([k,v])=>({engine,audio,source,pcmNode})[k]===v))).toBe(true);
 await expect(page.locator('#pitchError')).toBeHidden();await page.waitForFunction(()=>Number(document.getElementById('pitchCanvas').dataset.voiced)>15);
 if(info.project.name!=='desktop')await page.locator('#settings').click();
 await page.locator('#freeze').click();const end=await page.locator('#pitchCanvas').getAttribute('data-plotted-until');await page.waitForTimeout(250);expect(await page.locator('#pitchCanvas').getAttribute('data-plotted-until')).toBe(end);
});

test('completed pitch groups do not revise markers already shown',async({page})=>{
 await page.addInitScript(()=>{
  const arc=CanvasRenderingContext2D.prototype.arc;window.pitchMarkerAudit={values:{},errors:[],observations:0};
  CanvasRenderingContext2D.prototype.arc=function(x,y,...args){
   if(this.canvas.id==='pitchCanvas'&&window.soundglowSession?.featureState){const p=soundglowSession.featureState().pitch,box=document.getElementById('plot').getBoundingClientRect(),end=Math.max(0,(soundglowSession.state().displayedUntil||0)-p.confirmationMs/1000);
    if(p.samplingMs&&p.axis==='linear'){const width=Math.max(1,Math.round(box.width)-63),bottom=Math.round(box.height)-28,height=Math.max(1,bottom-34),time=end-p.history+(x-48)/width*p.history,key=time.toFixed(4),hz=p.minimum+(bottom-y)/height*(p.maximum-p.minimum),audit=window.pitchMarkerAudit;
     if(audit.values[key]!==undefined&&Math.abs(audit.values[key]-hz)>1e-5)audit.errors.push({time,first:audit.values[key],hz});audit.values[key]=hz;audit.observations++;
    }
   }return arc.call(this,x,y,...args);
  };
 });
 await page.goto('/dist/index.html');await page.getByRole('tab',{name:'Pitch',exact:true}).click();await page.locator('#demo').click();await page.waitForFunction(()=>Number(document.getElementById('pitchCanvas').dataset.voiced)>20);await page.waitForTimeout(600);
 const audit=await page.evaluate(()=>pitchMarkerAudit);expect(Object.keys(audit.values).length).toBeGreaterThan(20);expect(audit.observations).toBeGreaterThan(40);expect(audit.errors).toEqual([]);
});

test('pitch detector switching rebuilds history without restarting or unpausing audio',async({page},info)=>{
 if(info.project.name==='desktop')await page.setViewportSize({width:1280,height:900});
 await page.goto('/dist/index.html');await page.getByRole('tab',{name:'Pitch',exact:true}).click();await page.locator('#demo').click();
 await page.waitForFunction(()=>Number(document.getElementById('pitchCanvas').dataset.voiced)>10);await settings(page);await page.locator('#advancedPitchTrace > summary').click();
 await expect(page.locator('#pitchMethod')).toHaveValue('filtered');await expect(page.locator('#pitchCanvas')).toHaveAttribute('data-pitch-method','filtered');
 await page.evaluate(()=>window.detectorTransport={engine,audio,source});await page.locator('#pitchPreset').selectOption('praat');await expect(page.locator('#pitchMethod')).toHaveValue('raw');await expect(page.locator('#pitchCanvas')).toHaveAttribute('data-pitch-method','raw',{timeout:15000});
 await page.locator('#pitchPreset').selectOption('soundglow');await expect(page.locator('#pitchCanvas')).toHaveAttribute('data-pitch-method','filtered',{timeout:15000});
 await page.locator('#freeze').click();const frozen=await page.locator('#pitchCanvas').getAttribute('data-plotted-until');await page.locator('#pitchMethod').selectOption('raw');await expect(page.locator('#pitchCanvas')).toHaveAttribute('data-pitch-method','raw',{timeout:15000});await expect(page.locator('#state')).toHaveText('PAUSED');expect(await page.locator('#pitchCanvas').getAttribute('data-plotted-until')).toBe(frozen);
 await page.locator('#pitchMethod').selectOption('filtered');await page.locator('#pitchMethod').selectOption('raw');await page.locator('#pitchMethod').selectOption('filtered');await expect(page.locator('#pitchCanvas')).toHaveAttribute('data-pitch-method','filtered',{timeout:15000});
 await expect(page.locator('#pitchError')).toBeHidden();expect(await page.evaluate(()=>Object.entries(detectorTransport).every(([k,v])=>({engine,audio,source})[k]===v))).toBe(true);
});
