const {deleteItem}=require('./library-actions.cjs');
const {test,expect}=require('@playwright/test');
const path=require('node:path'),fs=require('node:fs');
const fixture=path.resolve(__dirname,'../../dist/audio/alice-waters.m4a');
test.beforeEach(async({page},info)=>{test.skip(info.project.name!=='desktop','Saved-file browsing is desktop only');await page.setViewportSize({width:1280,height:900});await page.goto('/dist/index.html');await page.evaluate(()=>fileLibrary.ready);});
async function load(page){await page.locator('#audioFileInput').setInputFiles(fixture);await page.waitForFunction(()=>fileLibrary.current&&!fileLibrary.loading);}
async function passage(page){
 const box=await page.locator('#fileWaveform').boundingBox();
 await page.mouse.move(box.x+box.width*.2,box.y+30);await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+30,{steps:5});await page.mouse.up();
}
async function save(page,name){await page.getByRole('button',{name:'Bookmark selection',exact:true}).click();await page.getByLabel('Bookmark name',{exact:true}).fill(name);await page.getByRole('button',{name:'Save bookmark',exact:true}).click();await expect(page.locator('#bookmarkForm')).toBeHidden();}
const state=page=>page.evaluate(()=>({file:fileLibrary.current.id,selection:fileLibrary.loop,start:fileLibrary.viewStart,span:fileLibrary.viewSpan,feature:document.getElementById('pitchTab').getAttribute('aria-selected'),speed:fileLibrary.media.playbackRate}));
test('named bookmarks restore the exact file, chart, view, selection and speed, paused with loop enabled',async({page})=>{
 await load(page);await expect(page.getByRole('button',{name:'Bookmark selection',exact:true})).toBeHidden();
 await passage(page);await page.getByRole('button',{name:'Fit selection',exact:true}).click();await page.getByRole('button',{name:'Zoom out waveform',exact:true}).click();await page.getByRole('tab',{name:'Pitch',exact:true}).click();
 await page.locator('.file-more summary').click();await page.getByRole('combobox',{name:'Speed',exact:true}).selectOption('0.75');const expected=await state(page);
 await save(page,'  Chorus  ');await page.getByRole('button',{name:'Open files library',exact:true}).click();await expect(page.locator('[data-bookmark]')).toHaveCount(1);await expect(page.locator('[data-bookmark] span')).toHaveText('Chorus');
 const layout=await page.evaluate(()=>({files:document.getElementById('audioFileList').getBoundingClientRect().bottom,bookmarks:document.getElementById('audioBookmarks').getBoundingClientRect().top}));expect(layout.bookmarks).toBeGreaterThan(layout.files);
 await page.locator('#audioFileInput').setInputFiles(fixture);await page.waitForFunction(()=>fileLibrary.files.length===2);await page.locator('#audioFileList [data-file]').nth(1).click();await page.waitForFunction(()=>!fileLibrary.loading);await page.getByRole('tab',{name:'Spectrogram',exact:true}).click();
 await page.locator('[data-bookmark]').click();await page.waitForFunction(()=>!fileLibrary.loading&&!!fileLibrary.loop);expect(await state(page)).toEqual(expected);await expect(page.getByRole('checkbox',{name:'Loop',exact:true})).toBeChecked();expect(await page.evaluate(()=>fileLibrary.position)).toBeCloseTo(expected.selection.start,5);expect(await page.evaluate(()=>fileLibrary.isPaused)).toBe(true);
 await page.waitForFunction(()=>filePreview?.selection&&Number(document.getElementById('pitchCanvas').dataset.voiced)>0);expect(await page.evaluate(()=>filePreview.selection)).toEqual(expected.selection);
 await page.getByRole('button',{name:'Play recording',exact:true}).click();await page.waitForFunction(()=>fileLibrary.playback.active);expect(await page.evaluate(()=>fileLibrary.playback.loop)).toBe(true);await page.getByRole('button',{name:'Pause recording',exact:true}).click();
 await page.reload();await page.evaluate(()=>fileLibrary.ready);await expect(page.locator('[data-bookmark] span')).toHaveText('Chorus');await page.locator('[data-bookmark]').click();await page.waitForFunction(()=>!fileLibrary.loading&&!!fileLibrary.loop);expect(await state(page)).toEqual(expected);expect(await page.evaluate(()=>fileLibrary.isPaused)).toBe(true);
 await page.screenshot({path:'/tmp/soundglow-bookmarks.png'});
});
test('bookmark naming can cancel, rejects blank names, and safely renders text; removal cascades only with its file',async({page})=>{
 await load(page);await passage(page);await page.getByRole('button',{name:'Bookmark selection',exact:true}).click();await expect(page.getByLabel('Bookmark name',{exact:true})).toBeFocused();await page.getByLabel('Bookmark name',{exact:true}).press('Escape');await expect(page.locator('#bookmarkForm')).toBeHidden();expect(await page.evaluate(()=>fileLibrary.loop!==null)).toBe(true);
 await page.getByRole('button',{name:'Bookmark selection',exact:true}).click();await page.getByLabel('Bookmark name',{exact:true}).fill('   ');await page.getByRole('button',{name:'Save bookmark',exact:true}).click();await expect(page.locator('#bookmarkForm')).toBeVisible();expect(await page.evaluate(()=>fileLibrary.bookmarks.length)).toBe(0);await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await save(page,'<img src=x onerror=alert(1)>');await expect(page.locator('[data-bookmark] span')).toHaveText('<img src=x onerror=alert(1)>');await expect(page.locator('#audioBookmarkList img')).toHaveCount(0);
 await page.getByRole('button',{name:'Open files library',exact:true}).click();await deleteItem(page,page.locator('[data-bookmark]'),'bookmark');await expect(page.locator('#audioBookmarks')).toBeHidden();expect(await page.evaluate(()=>fileLibrary.files.length)).toBe(1);
 await save(page,'Delete with file');await deleteItem(page,page.locator('[data-file][aria-pressed="true"]'),'file');await expect(page.locator('#audioFileList [data-file]')).toHaveCount(0);await expect(page.locator('#audioBookmarks')).toBeHidden();expect(await page.evaluate(()=>fileLibrary.store.bookmarks())).toEqual([]);
 await page.reload();await page.evaluate(()=>fileLibrary.ready);await expect(page.locator('[data-bookmark]')).toHaveCount(0);
});
test('version one local libraries upgrade without losing recordings or saved position',async({page,browserName})=>{
 const bytes=fs.readFileSync(fixture).toString('base64');
 await page.evaluate(async({bytes,chunked})=>{
  fileLibrary.store.db.close();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('soundglow-audio-library');r.onsuccess=resolve;r.onerror=()=>reject(r.error);});
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('soundglow-audio-library',1);r.onupgradeneeded=()=>{r.result.createObjectStore('files',{keyPath:'id'});r.result.createObjectStore('blobs');r.result.createObjectStore('preferences');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const tx=db.transaction(['files','blobs','preferences'],'readwrite');tx.objectStore('files').add({id:'legacy',name:'legacy.m4a',duration:38.15,position:3,addedAt:1});const data=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0));if(chunked){tx.objectStore('blobs').put({kind:'chunks',count:1,type:'audio/mp4',complete:true},'legacy');tx.objectStore('blobs').put(data.buffer,['legacy',0]);}else tx.objectStore('blobs').put(new Blob([data],{type:'audio/mp4'}),'legacy');tx.objectStore('preferences').put('legacy','selected');await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
 // WebKit cannot reliably seed Blob values; v1 also supports the chunk manifest.
 },{bytes,chunked:browserName==='webkit'});
 await page.reload();await page.evaluate(()=>fileLibrary.ready);expect(await page.evaluate(()=>fileLibrary.store.db.version)).toBe(2);await expect(page.locator('#fileTitle')).toHaveText('legacy.m4a');expect(await page.evaluate(()=>fileLibrary.position)).toBeCloseTo(3,2);await passage(page);await save(page,'Legacy passage');expect(await page.evaluate(async()=>!!await fileLibrary.store.get('legacy'))).toBe(true);
});
test('bookmark restores do not overwrite a later file selection',async({page})=>{
 await load(page);await passage(page);await save(page,'Earlier');await page.locator('#audioFileInput').setInputFiles(fixture);await page.waitForFunction(()=>fileLibrary.files.length===2);
 const result=await page.evaluate(async()=>{const later=fileLibrary.files[1].id,opening=fileLibrary.openBookmark(fileLibrary.bookmarks[0].id);await fileLibrary.select(later);await opening;return {file:fileLibrary.current.id,later,loop:fileLibrary.loop};});expect(result.file).toBe(result.later);expect(result.loop).toBeNull();await expect(page.getByRole('checkbox',{name:'Loop',exact:true})).not.toBeChecked();
});
test('failed bookmark writes retain the name and selection for retry without a phantom entry',async({page})=>{
 await load(page);await passage(page);const selection=await page.evaluate(()=>({...fileLibrary.loop}));await page.getByRole('button',{name:'Bookmark selection',exact:true}).click();await page.getByLabel('Bookmark name',{exact:true}).fill('Retry me');
 await page.evaluate(()=>{const add=fileLibrary.store.addBookmark.bind(fileLibrary.store);let failed=false;fileLibrary.store.addBookmark=bookmark=>{if(!failed){failed=true;return Promise.reject(Error('Storage full'));}return add(bookmark);};});
 await page.getByRole('button',{name:'Save bookmark',exact:true}).click();await expect(page.locator('#audioLibraryStatus')).toHaveText('Could not save the bookmark. Please retry.');await expect(page.getByLabel('Bookmark name',{exact:true})).toHaveValue('Retry me');await expect(page.locator('[data-bookmark]')).toHaveCount(0);expect(await page.evaluate(()=>fileLibrary.loop)).toEqual(selection);
 await page.getByRole('button',{name:'Save bookmark',exact:true}).click();await expect(page.locator('#bookmarkForm')).toBeHidden();await expect(page.locator('[data-bookmark] span')).toHaveText('Retry me');await save(page,'Second');await page.reload();await page.evaluate(()=>fileLibrary.ready);await expect(page.locator('[data-bookmark] span')).toHaveText(['Retry me','Second']);
});
test('selection actions have a reserved row without shifting playback controls or the chart',async({page})=>{
 await load(page);
 const geometry=()=>page.evaluate(()=>Object.fromEntries(['fileTransport','fileWaveform','filePlay','fileSelectionControls'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x,y:r.y,width:r.width,height:r.height}];})));
 for(const width of [800,1280]){
  await page.setViewportSize({width,height:900});
  const before=await geometry();await passage(page);await expect(page.getByRole('button',{name:'Bookmark selection',exact:true})).toBeVisible();expect(await geometry()).toEqual(before);
  const row=page.getByRole('group',{name:'Selection controls',exact:true});await expect(row.getByRole('button',{name:'Fit selection',exact:true})).toBeVisible();await expect(row.getByRole('button',{name:'Clear passage',exact:true})).toBeVisible();
  expect(before.fileSelectionControls.y).toBeGreaterThan(before.filePlay.y+before.filePlay.height);
  await page.getByRole('button',{name:'Bookmark selection',exact:true}).click();await expect(page.getByLabel('Bookmark name',{exact:true})).toBeFocused();expect(await geometry()).toEqual(before);await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(await geometry()).toEqual(before);
  await page.getByRole('button',{name:'Clear passage',exact:true}).click();await expect(page.getByRole('button',{name:'Bookmark selection',exact:true})).toBeHidden();expect(await geometry()).toEqual(before);
 }
});
