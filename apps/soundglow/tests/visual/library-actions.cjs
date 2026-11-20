const {expect}=require('@playwright/test');
async function deleteItem(page,item,kind){
 // Let the previous dialog finish closing before opening a new menu.
 await expect(page.locator('#libraryItemDialog')).not.toBeVisible();
 await item.click({button:'right'});
 await page.getByRole('menuitem',{name:'Delete…',exact:true}).click();
 await page.getByRole('button',{name:`Delete ${kind}`,exact:true}).click();
}
module.exports={deleteItem};
