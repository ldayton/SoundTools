// SPDX-License-Identifier: GPL-3.0-or-later
#include "NUM2.h"
// Included after the array adapter; shares its output buffers, metadata and error owner.
// Configurable frame FFT. The original Gaussian PSD entry point is unchanged.
// Polyphase sinc filter with float coefficients and split float dot products.
// The compatible Kaiser series preserves the observed first-divisor convention.
struct SgPolyphase {
 double rate=0,target=0;int quality=-1,half=0,phases=0;
 std::vector<float> right,left;
 static double i0(double x){double sum=1,y=x*x/4,term=y;int k=1;while(term>1e-12&&k<100){sum+=term;term*=y/(k*k);k++;}return sum;}
 static double sinc(double x){return x==0?1:sin(NUMpi*x)/(NUMpi*x);}
 void configure(double input,double output,int q){
  if(rate==input&&target==output&&quality==q)return;
  rate=input;target=output;quality=q;
  const double rolloffs[]={.9,.92,.94,.965,.965},attenuations[]={55,68,80,96,96};
  const int mins[]={96,128,160,192,256},maxs[]={160,192,256,384,640},pmins[]={512,1024,1024,2048,4096},pmaxs[]={1024,2048,2048,4096,8192};
  const double rolloff=rolloffs[q],atten=attenuations[q],factor=output/input;
  int taps=int(ceil((atten-8)/(14.36*std::max(.0001,.5*(1-rolloff)*std::max(.25,std::min(1.0,factor))))));
  taps=std::clamp(taps,mins[q],maxs[q]);if(taps%2)taps++;half=taps/2;
  phases=1;while(phases<std::clamp(taps*8,pmins[q],pmaxs[q]))phases*=2;
  const double beta=atten>50?.1102*(atten-8.7):0,cutoff=.5*std::min(1.0,factor)*rolloff,denom=i0(beta);
  std::vector<double> window(taps);for(int j=0;j<taps;j++){double x=2.0*j/(taps-1)-1;window[j]=i0(beta*sqrt(1-x*x))/denom;}
  right.resize(phases*half);left.resize(phases*half);
  for(int p=0;p<phases;p++){
   const double fraction=double(p)/phases;double sum=0;
   for(int j=-half;j<half;j++)sum+=sinc(2*cutoff*(j-fraction))*window[j+half];
   const double gain=sum==0?1:1/sum;
   for(int j=0;j<half;j++){
    right[p*half+j]=float(sinc(2*cutoff*(j-fraction))*window[j+half]*gain);
    left[p*half+j]=float(sinc(2*cutoff*(-j-1-fraction))*window[half-j-1]*gain);
   }
  }
 }
 float sample(constSound sound,double time){
  const int centre=int(floor(time));const double phase=(time-centre)*phases;
  const int a=std::min(phases-1,int(phase)),b=(a+1)%phases;const double mix=phase-a;
  float ar=0,al=0,br=0,bl=0;
  for(int j=0;j<half;j++){
   const int ri=centre+j,li=centre-j-1;
   const float rv=ri>=0&&ri<sound->nx?float(sound->z[1][ri+1]):0,lv=li>=0&&li<sound->nx?float(sound->z[1][li+1]):0;
   ar+=rv*right[a*half+j];al+=lv*left[a*half+j];br+=rv*right[b*half+j];bl+=lv*left[b*half+j];
  }
  const double av=float(ar+al),bv=float(br+bl);return float(av+(bv-av)*mix);
 }
};
static SgPolyphase sgPolyphase;
extern "C" EMSCRIPTEN_KEEPALIVE int sg_transform(const float *pcm,int length,double rate,
 double targetRate,double window,double hop,int shape,int padding,int removeDC,int amplitude,
 double firstCentre,int resampling,int quality){
 output.clear();error.clear();nt=nf=0;
 try{
  if((resampling!=0&&resampling!=1)||quality<0||quality>4||!pcm||length<2||!std::isfinite(rate)||rate<8000||rate>192000||length>rate||
   !std::isfinite(window)||window<.001||window>.1||!std::isfinite(hop)||hop<.001||hop>.1||
   (shape!=0&&shape!=1)||(padding!=0&&padding!=2)||
   (targetRate!=0&&targetRate!=8000&&targetRate!=16000)||(!std::isfinite(firstCentre)||firstCentre<0||firstCentre>1)){
   error="Invalid frame analysis settings";return -1;
  }
  auto sound=Sound_create(1,0,double(length)/rate,length,1/rate,.5/rate);
  for(int i=0;i<length;i++){if(!std::isfinite(pcm[i])){error="Nonfinite PCM";return -1;}sound->z[1][i+1]=pcm[i];}
  if(targetRate&&targetRate!=rate){
   if(resampling){
    sgPolyphase.configure(rate,targetRate,quality);
    const int count=int(floor(sound->nx*targetRate/rate));
    auto resampled=Sound_create(1,0,double(count)/targetRate,count,1/targetRate,.5/targetRate);
    for(int i=0;i<count;i++)resampled->z[1][i+1]=sgPolyphase.sample(sound.get(),i*rate/targetRate);
    sound=resampled.move();
   }else sound=Sound_resample(sound.get(),targetRate,50);
   rate=targetRate;
  }
  const int win=int(std::lround(window*rate*(shape==0?2:1)));
  int n=1;while(n<win*(padding==2?2:1))n*=2;
  if(n>65536||win<2){error="FFT size exceeds supported bounds";return -1;}
  nf=n/2+1;df=rate/n;f1=0;dt=hop;
  const double centre=std::max(firstCentre,win/(2*rate));t1=centre;
  const double duration=sound->nx/rate;
  nt=std::max(0,int(std::floor((duration-win/(2*rate)-centre+1e-8)/hop))+1);
  if(nt*nf>4000000){error="Analysis output exceeds four million cells";return -1;}
  output.resize(size_t(nt)*nf);
  autoVEC data=zero_VEC(n);autoNUMFourierTable fft=NUMFourierTable_create(n);
  std::vector<float> weights(win);double weightPower=0;
  for(int j=0;j<win;j++){
   const double phase=(double(j)-.5*(win-1))/win;
   weights[j]=shape==1?float(.5-.5*cos(2*NUMpi*j/win)):float((exp(-48*phase*phase)-exp(-12))/(1-exp(-12)));
   weightPower+=double(weights[j])*weights[j];
  }
  for(int frame=0;frame<nt;frame++){
   const int begin=int(std::lround((centre+frame*hop)*rate-win*.5));double mean=0;
   if(begin<0||begin+win>sound->nx){error="Frame lies outside supplied PCM";return -1;}
   for(int j=0;j<n;j++){data[j+1]=j<win?float(sound->z[1][begin+j+1]):0;mean+=data[j+1];}
   const float dc=removeDC?float(mean/win):0;
   for(int j=0;j<n;j++){const float value=float(float(data[j+1])-dc);data[j+1]=j<win?float(value*weights[j]):0;}
   NUMfft_forward(fft.get(),data.get());
   for(int k=0;k<nf;k++){
    double power=k==0?data[1]*data[1]:k==n/2?data[n]*data[n]:data[2*k]*data[2*k]+data[2*k+1]*data[2*k+1];
    const double factor=(k==0||k==n/2?1.0:2.0)/win;
    output[size_t(frame)*nf+k]=float(amplitude?power*factor*factor:power/weightPower);
   }
  }
  return 0;
 }catch(MelderError){error=Melder_peek32to8(Melder_getError());Melder_clearError();return -1;}
 catch(const std::exception &e){error=e.what();return -1;}
}
