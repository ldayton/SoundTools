// Research-only YIN-style periodicity measure, not a Voice Tools implementation.
function periodicity(pcm,rate,time,{floor=50,ceiling=1200}={}){
 if(!Number.isFinite(rate)||rate<8000||!Number.isFinite(time)||time<0||!Number.isFinite(floor)||!Number.isFinite(ceiling)||floor<=0||ceiling<=floor||ceiling>=rate/2)throw Error('Invalid periodicity geometry');
 const width=Math.round(rate*.032),maximum=Math.floor(rate/floor),minimum=Math.ceil(rate/ceiling),length=Math.max(Math.round(rate*.064),width+maximum),start=Math.round(time*rate)-Math.floor(length/2);
 if(start<0||start+length>pcm.length)return null;
 let best=Infinity,bestLag=0,total=0;
 for(let lag=1;lag<=maximum;lag++){let difference=0;for(let j=0;j<width;j++){const a=pcm[start+j],b=pcm[start+j+lag];if(!Number.isFinite(a)||!Number.isFinite(b))throw Error('Nonfinite PCM');difference+=(a-b)**2;}total+=difference;const normalized=total?difference*lag/total:1;if(lag>=minimum&&normalized<best){best=normalized;bestLag=lag;}}
 return {difference:best,hz:rate/bestLag};
}
module.exports={periodicity};
