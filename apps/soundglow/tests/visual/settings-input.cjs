// Use actual native inputs or the accessible Mantine slider, never hidden proxies.
async function setSetting(page,id,value){
 const control=page.locator('#'+id);
 if(await control.getAttribute('type')!=='hidden'){
  if(await control.evaluate(el=>el.tagName==='SELECT'))await control.selectOption(String(value));else await control.fill(String(value));
  return;
 }
 const slider=page.locator('#'+id+'-slider'),min=Number(await slider.getAttribute('aria-valuemin')),max=Number(await slider.getAttribute('aria-valuemax')),step=Number(await slider.getAttribute('data-step')||1),target=Number(value);
 let current=Number(await slider.getAttribute('aria-valuenow'));
 if(Math.abs(target-min)<Math.abs(target-current)){await slider.press('Home');current=min;}
 if(Math.abs(max-target)<Math.abs(target-current)){await slider.press('End');current=max;}
 const count=Math.round(Math.abs(target-current)/step);
 for(let i=0;i<count;i++)await slider.press(target>current?'ArrowRight':'ArrowLeft');
}
const setHistory=(page,value)=>setSetting(page,'history',value);
module.exports={setSetting,setHistory};
async function sectionExpanded(page,id){
 const node=page.locator('#'+id);
 return await node.evaluate(el=>el.tagName==='DETAILS')?await node.getAttribute('open')!==null:await node.getByRole('button').first().getAttribute('aria-expanded')==='true';
}
async function expandSection(page,id){
 if(await sectionExpanded(page,id))return;
 const node=page.locator('#'+id);
 if(await node.evaluate(el=>el.tagName==='DETAILS'))await node.locator(':scope > summary').click();else await node.getByRole('button').first().click();
}
module.exports.expandSection=expandSection;module.exports.sectionExpanded=sectionExpanded;
