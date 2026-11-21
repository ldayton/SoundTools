const {waitForDialogClosed}=require('../../../../scripts/ci/browser-harness.cjs');
async function deleteItem(page,item,kind){
 // Let the previous dialog finish closing before opening a new menu.
 await waitForDialogClosed(page,'#libraryItemDialog');
 await item.click({button:'right'});
 await page.getByRole('menuitem',{name:'Delete…',exact:true}).click();
 await page.getByRole('button',{name:`Delete ${kind}`,exact:true}).click();
}
module.exports={deleteItem};
