// SPDX-License-Identifier: GPL-3.0-or-later
// Optional single-frame Burg envelope; shares the adapter's PCM/error ownership.
static std::vector<float> lpcPower, lpcCoefficients;
static double lpcGain=0,lpcRate=0,lpcCentre=0;
extern "C" {
EMSCRIPTEN_KEEPALIVE int sg_lpc(const float *pcm,int length,double rate,double ceiling,double window,int order,int bins,double emphasis){
 lpcPower.clear();lpcCoefficients.clear();lpcGain=0;lpcRate=0;error.clear();
 try{
  if(!pcm||!std::isfinite(rate)||rate<8000||rate>192000||length<2||length>rate||!std::isfinite(ceiling)||ceiling<2000||ceiling>8000||ceiling>rate/2||!std::isfinite(window)||window<.005||window>.1||order<2||order>32||bins<32||bins>2048||!std::isfinite(emphasis)||emphasis<0||emphasis>1000){error="Invalid LPC parameters";return -1;}
  auto sound=Sound_create(1,0,double(length)/rate,length,1/rate,.5/rate);
  for(integer i=1;i<=length;i++){if(!std::isfinite(pcm[i-1])){error="Nonfinite LPC input";return -1;}sound->z[1][i]=pcm[i-1];}
  auto sampled=Sound_resample(sound.get(),2*ceiling,50);lpcRate=1/sampled->dx;
  const integer n=integer(std::lround(2*window*lpcRate));
  if(n>sampled->nx||n<order+2){error="Insufficient LPC window context";return -1;}
  if(emphasis>0)Sound_preEmphasize_inplace(sampled.get(),emphasis);
  autoVEC frame=raw_VEC(n),coefficients=zero_VEC(order);
  integer frameCount=0;Sampled_shortTermAnalysis(sampled.get(),2*window,1,&frameCount,&lpcCentre);
  const integer first=Sampled_xToNearestIndex(sampled.get(),lpcCentre-window);double energy=0;
  for(integer i=1;i<=n;i++)frame[i]=(first+i-1>=1&&first+i-1<=sampled->nx?sampled->z[1][first+i-1]:0);
  centre_VEC_inout(frame.get(),nullptr);
  for(integer i=1;i<=n;i++){const double mid=.5*(n+1),edge=std::exp(-12.0),weight=(std::exp(-48.0*(i-mid)*(i-mid)/(double(n)*n))-edge)/(1-edge);frame[i]*=weight;energy+=frame[i]*frame[i];}
  if(energy>1e-20)lpcGain=VECburg(coefficients.get(),frame.get());
  if(!std::isfinite(lpcGain)||lpcGain<0)lpcGain=0;
  lpcCoefficients.resize(order);for(int i=0;i<order;i++)lpcCoefficients[i]=coefficients[i+1];
  lpcPower.resize(bins);
  for(int i=0;i<bins;i++){const double omega=NUMpi*i/(bins-1);double re=1,im=0;for(int k=1;k<=order;k++){re-=coefficients[k]*std::cos(omega*k);im+=coefficients[k]*std::sin(omega*k);}const double p=lpcGain/std::max(1e-20,re*re+im*im);lpcPower[i]=std::isfinite(p)?float(std::min(p,1e30)):0;}
  return bins;
 }catch(MelderError){error=Melder_peek32to8(Melder_getError());Melder_clearError();return -1;}
 catch(const std::exception &e){error=e.what();return -1;}
}
EMSCRIPTEN_KEEPALIVE const float *sg_lpc_power(){return lpcPower.data();}
EMSCRIPTEN_KEEPALIVE const float *sg_lpc_coefficients(){return lpcCoefficients.data();}
EMSCRIPTEN_KEEPALIVE double sg_lpc_gain(){return lpcGain;}
EMSCRIPTEN_KEEPALIVE double sg_lpc_centre(){return lpcCentre;}
EMSCRIPTEN_KEEPALIVE double sg_lpc_rate(){return lpcRate;}
EMSCRIPTEN_KEEPALIVE void sg_lpc_release(){std::vector<float>().swap(lpcPower);std::vector<float>().swap(lpcCoefficients);lpcGain=lpcRate=lpcCentre=0;}
}
