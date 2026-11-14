// Drive the actual accessible slider rather than its form-serialization input.
async function setHistory(page,value){
 const slider=page.getByRole('slider',{name:'History',exact:true});
 const min=Number(await slider.getAttribute('aria-valuemin')),max=Number(await slider.getAttribute('aria-valuemax'));
 if(Number(value)===max){await slider.press('End');return;}
 await slider.press('Home');
 for(let i=min;i<Number(value);i++)await slider.press('ArrowRight');
}
module.exports={setHistory};
