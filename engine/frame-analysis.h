// SPDX-License-Identifier: GPL-3.0-or-later
#include "NUM2.h"
// Included after the array adapter; shares its output buffers, metadata and error owner.
// Configurable frame FFT. The original Gaussian PSD entry point is unchanged.
extern "C" EMSCRIPTEN_KEEPALIVE int sg_transform(const float *pcm,int length,double rate,
 double targetRate,double window,double hop,int shape,int padding,int removeDC,int amplitude,
 double firstCentre){
 output.clear();error.clear();nt=nf=0;
 try{
  if(!pcm||length<2||!std::isfinite(rate)||rate<8000||rate>192000||length>rate||
   !std::isfinite(window)||window<.001||window>.1||!std::isfinite(hop)||hop<.001||hop>.1||
   (shape!=0&&shape!=1)||(padding!=0&&padding!=2)||
   (targetRate!=0&&targetRate!=8000&&targetRate!=16000)||(!std::isfinite(firstCentre)||firstCentre<0||firstCentre>1)){
   error="Invalid frame analysis settings";return -1;
  }
  auto sound=Sound_create(1,0,double(length)/rate,length,1/rate,.5/rate);
  for(int i=0;i<length;i++){if(!std::isfinite(pcm[i])){error="Nonfinite PCM";return -1;}sound->z[1][i+1]=pcm[i];}
  if(targetRate&&targetRate!=rate){sound=Sound_resample(sound.get(),targetRate,50);rate=targetRate;}
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
   const float dc=removeDC?float(mean/n):0;
   for(int j=0;j<n;j++){const float value=float(float(data[j+1])-dc);data[j+1]=j<win?float(value*weights[j]):value;}
   NUMfft_forward(fft.get(),data.get());
   for(int k=0;k<nf;k++){
    double power=k==0?data[1]*data[1]:k==n/2?data[n]*data[n]:data[2*k]*data[2*k]+data[2*k+1]*data[2*k+1];
    const double factor=(k==0||k==n/2?1.0:2.0)/n;
    output[size_t(frame)*nf+k]=float(amplitude?power*factor*factor:power/weightPower);
   }
  }
  return 0;
 }catch(MelderError){error=Melder_peek32to8(Melder_getError());Melder_clearError();return -1;}
 catch(const std::exception &e){error=e.what();return -1;}
}
