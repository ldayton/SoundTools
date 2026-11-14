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
