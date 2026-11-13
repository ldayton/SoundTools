async function deleteItem(page,item,kind){
 await item.click({button:'right'});
 await page.getByRole('menuitem',{name:'Delete…',exact:true}).click();
 await page.getByRole('button',{name:`Delete ${kind}`,exact:true}).click();
}
module.exports={deleteItem};
