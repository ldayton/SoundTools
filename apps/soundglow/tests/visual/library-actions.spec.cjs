const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const {deleteItem}=require('./library-actions.cjs');
const buffer=fs.readFileSync(path.resolve(__dirname,'../../dist/audio/alice-waters.m4a'));
const longName='A very long recording title with extra information and no reason to consume the entire sidebar '.repeat(2)+'.m4a';
test.beforeEach(async({page},info)=>{test.skip(info.project.name!=='desktop');await page.setViewportSize({width:1280,height:900});await page.goto('/dist/index.html');await page.evaluate(()=>fileLibrary.ready);});
async function load(page,name=longName){await page.locator('#audioFileInput').setInputFiles({name,mimeType:'audio/mp4',buffer});await page.waitForFunction(name=>fileLibrary.files.some(f=>f.name===name)&&!fileLibrary.importing&&fileLibrary.current&&!fileLibrary.loading,name);}
async function menu(page,item,action){await item.click({button:'right'});await page.getByRole('menuitem',{name:action+'…',exact:true}).click();}
async function bookmark(page){await page.evaluate(async()=>{const b={id:'test-bookmark',fileId:fileLibrary.current.id,name:'A bookmarked passage',selection:{start:1,end:2},viewStart:0,viewSpan:5,feature:'pitch',speed:1,addedAt:1};await fileLibrary.store.addBookmark(b);fileLibrary.bookmarks.push(b);fileLibrary.renderBookmarks();});}
test('two-line names and shared rename preserve selection and survive stale saves and reload',async({page})=>{
 await load(page);await page.getByRole('button',{name:'Open files library',exact:true}).click();
 const row=page.locator('[data-file]');await expect(row).toHaveAttribute('title',new RegExp('A very long recording title'));
 const size=await row.locator('span').evaluate(el=>({height:el.getBoundingClientRect().height,line:parseFloat(getComputedStyle(el).lineHeight),clamp:getComputedStyle(el).webkitLineClamp}));expect(size.height).toBeLessThanOrEqual(size.line*2);expect(size.clamp).toBe('2');
 await bookmark(page);await page.locator('[data-bookmark]').click();await page.waitForFunction(()=>!fileLibrary.loading&&!!fileLibrary.loop);
 const before=await page.evaluate(()=>({loop:fileLibrary.loop,start:fileLibrary.viewStart,span:fileLibrary.viewSpan,position:fileLibrary.position}));
 await page.evaluate(()=>window.staleFile={...fileLibrary.current});await menu(page,row,'Rename');await expect(page.locator('#libraryItemName')).toHaveValue(longName);await page.locator('#libraryItemName').fill('Renamed recording.m4a');await page.getByRole('button',{name:'Save name',exact:true}).click();await expect(page.locator('#libraryItemDialog')).not.toBeVisible();
 await expect(page.locator('#fileTitle')).toHaveText('Renamed recording.m4a');expect(await page.evaluate(()=>({loop:fileLibrary.loop,start:fileLibrary.viewStart,span:fileLibrary.viewSpan,position:fileLibrary.position}))).toEqual(before);
 await expect(page.locator('[data-bookmark]')).toHaveAttribute('title',/Renamed recording/);
 await page.evaluate(()=>fileLibrary.store.update(staleFile));await page.reload();await page.evaluate(()=>fileLibrary.ready);await expect(page.locator('[data-file] span')).toHaveText('Renamed recording.m4a');
 await menu(page,page.locator('[data-bookmark]'),'Rename');await page.locator('#libraryItemName').fill('  <b>Verse</b>  ');await page.getByRole('button',{name:'Save name',exact:true}).click();await expect(page.locator('[data-bookmark] span')).toHaveText('<b>Verse</b>');await expect(page.locator('#audioBookmarkList b')).toHaveCount(0);
 await page.reload();await page.evaluate(()=>fileLibrary.ready);await expect(page.locator('[data-bookmark] span')).toHaveText('<b>Verse</b>');
});
test('right-click, keyboard and ellipsis share actions; cancel and storage errors preserve data',async({page})=>{
 await load(page,'First.m4a');await page.getByRole('button',{name:'Open files library',exact:true}).click();const row=page.locator('[data-file]');await row.focus();await row.press('Shift+F10');await expect(page.getByRole('menuitem',{name:'Rename…'})).toBeFocused();await page.keyboard.press('ArrowDown');await expect(page.getByRole('menuitem',{name:'Delete…'})).toBeFocused();await page.keyboard.press('Escape');await expect(page.locator('#filesBody')).toBeVisible();await expect(page.locator('#libraryItemMenu')).not.toBeVisible();
 await page.locator('.library-more').click();await page.getByRole('menuitem',{name:'Rename…'}).click();await page.locator('#libraryItemName').fill('   ');await page.getByRole('button',{name:'Save name'}).click();await expect(page.locator('#libraryItemDialog')).toBeVisible();await page.keyboard.press('Escape');await expect(row.locator('span')).toHaveText('First.m4a');
 await menu(page,row,'Rename');await page.locator('#libraryItemName').fill('Retry.m4a');await page.evaluate(()=>{const rename=fileLibrary.store.rename.bind(fileLibrary.store);let first=true;fileLibrary.store.rename=(...args)=>{if(first){first=false;return Promise.reject(Error('quota'));}return rename(...args);};});await page.getByRole('button',{name:'Save name'}).click();await expect(page.locator('#libraryItemError')).toHaveText('Could not rename this file. Please retry.');await expect(page.locator('#libraryItemName')).toHaveValue('Retry.m4a');await page.getByRole('button',{name:'Save name'}).click();await expect(row.locator('span')).toHaveText('Retry.m4a');
 await bookmark(page);await menu(page,page.locator('[data-bookmark]'),'Delete');await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('[data-bookmark]')).toHaveCount(1);await deleteItem(page,page.locator('[data-bookmark]'),'bookmark');await expect(page.locator('[data-bookmark]')).toHaveCount(0);await expect(row).toHaveCount(1);
});
test('deleting an inactive file does not interrupt playback and late saves cannot resurrect it',async({page})=>{
 await load(page,'First.m4a');await bookmark(page);await load(page,'Second.m4a');await page.evaluate(()=>fileLibrary.select(fileLibrary.files[1].id));await page.getByRole('button',{name:'Open files library',exact:true}).click();
 await page.getByRole('button',{name:'Play recording',exact:true}).click();await page.waitForFunction(()=>!fileLibrary.isPaused);
 const selected=await page.evaluate(()=>fileLibrary.current.id);await page.evaluate(()=>window.deletedSnapshot={...fileLibrary.files[0]});
 await menu(page,page.locator('[data-file]').first(),'Delete');expect(await page.evaluate(()=>fileLibrary.current.id)).toBe(selected);expect(await page.evaluate(()=>fileLibrary.isPaused)).toBe(false);await page.getByRole('button',{name:'Delete file',exact:true}).click();await expect(page.locator('[data-file]')).toHaveCount(1);expect(await page.evaluate(()=>fileLibrary.current.id)).toBe(selected);expect(await page.evaluate(()=>fileLibrary.isPaused)).toBe(false);await expect(page.locator('[data-bookmark]')).toHaveCount(0);
 await page.evaluate(()=>fileLibrary.store.update(deletedSnapshot));expect(await page.evaluate(async()=>!!await fileLibrary.store.get(deletedSnapshot.id))).toBe(false);
 await page.getByRole('button',{name:'Pause recording',exact:true}).click();
});
