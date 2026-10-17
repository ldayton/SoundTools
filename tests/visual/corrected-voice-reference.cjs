// Independent JS DSP reference: explicit float FIR, radix-2 complex FFT, and
// timestamped peak buckets. Does not call production WASM or display helpers.
module.exports=function reference(pcm,legacy){
 const f=Math.fround,half=128,cutoff=.5/6*.94,beta=.1102*(80-8.7);
 function i0(x){let sum=1,y=x*x/4,term=y,k=1;while(term>1e-12&&k<100){sum+=term;term*=y/(k*k);k++;}return sum;}
 const denom=i0(beta),sinc=x=>x===0?1:Math.sin(Math.PI*x)/(Math.PI*x);
 const window=Array.from({length:half*2},(_,j)=>{const x=2*j/(half*2-1)-1;return i0(beta*Math.sqrt(1-x*x))/denom;});
 // At 48 -> 8 kHz every output sample uses the integer FIR phase.
 const weights=window.map((w,j)=>sinc(2*cutoff*(j-half))*w),sum=weights.reduce((a,b)=>a+b,0),filter=weights.map(w=>f(w/sum));
 const samples=Float32Array.from({length:Math.floor(pcm.length/6)},(_,i)=>{let right=0,left=0;const centre=i*6;for(let j=0;j<half;j++){right=f(right+f((pcm[centre+j]||0)*filter[half+j]));left=f(left+f((pcm[centre-j-1]||0)*filter[half-j-1]));}return f(right+left);});
 function fft(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}for(let size=2;size<=n;size*=2)for(let start=0;start<n;start+=size)for(let k=0;k<size/2;k++){const a=-2*Math.PI*k/size,c=Math.cos(a),s=Math.sin(a),j=start+k,l=j+size/2,tr=c*re[l]-s*im[l],ti=s*re[l]+c*im[l];re[l]=re[j]-tr;im[l]=im[j]-ti;re[j]+=tr;im[j]+=ti;}}
 const spectra=[],holds=[],normed=[],epochs=new Map();let hold=0,last=null;
 for(let frame=0;frame<legacy.times.length;frame++){
  const begin=Math.round((legacy.times[frame]-.032)*8000),data=samples.slice(begin,begin+512),mean=f(data.reduce((a,b)=>a+b,0)/512),re=new Float64Array(1024),im=new Float64Array(1024);
  for(let j=0;j<512;j++)re[j]=f(f(data[j]-mean)*f(.5-.5*Math.cos(2*Math.PI*j/512)));
  fft(re,im);const db=Array.from({length:513},(_,k)=>{const power=f((re[k]**2+im[k]**2)*((k===0||k===512?1:2)/512)**2);return Math.max(0,Math.min(255,10*Math.log10(power)+92));});
  const time=legacy.clockTimes[frame]/1000,epoch=Math.floor(time),peak=Math.max(0,...db);
  if(last!==null&&time<last){epochs.clear();hold=0;}
  for(const key of epochs.keys())if(epoch-key>=5)epochs.delete(key);
  epochs.set(epoch,Math.max(epochs.get(epoch)||0,peak));const maximum=Math.max(0,...epochs.values()),retention=Math.pow(f(.995),last===null?1:Math.max(0,(time-last)/.016));
  hold=Math.max(f(retention*f(hold)+(1-retention)*maximum),maximum);last=time;
  spectra.push(db);holds.push(hold);normed.push(db.map(x=>x/hold));
 }
 return {...legacy,spectra,holds,normed};
};
