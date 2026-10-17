using System.Reflection;
using System.Runtime.Loader;
using System.Runtime.InteropServices;
var root="/Applications/VoiceTools.app/WrappedBundle";
AssemblyLoadContext.Default.Resolving += (ctx,name)=> {var p=Path.Combine(root,name.Name+".dll");return File.Exists(p)?ctx.LoadFromAssemblyPath(p):null;};
var a=AssemblyLoadContext.Default.LoadFromAssemblyPath(root+"/DevExtras.Common.Audio.dll");
NativeLibrary.SetDllImportResolver(a,(name,assembly,path)=> {Console.Error.WriteLine("native: "+name);return name=="__Internal"||name.Contains("Accelerate")?NativeLibrary.Load("/System/Library/Frameworks/Accelerate.framework/Accelerate"):IntPtr.Zero;});

var funcsType=a.GetType("DevExtras.Common.Audio.Core.AudioFunctions")!;
object NewFuncs(int n)=>Activator.CreateInstance(funcsType,new object[]{(uint)n})!;
object? Call(object x,string name,params object[] args)=>x.GetType().GetMethods().Single(m=>m.Name==name&&m.GetParameters().Length==args.Length).Invoke(x,args);
var window=a.GetType("DevExtras.Common.Audio.PreProcess_Window")!.GetMethods().Single(m=>m.Name=="Apply"&&m.GetParameters().Length==4);
var remove=a.GetType("DevExtras.Common.Audio.PreProcess_Misc")!.GetMethod("RemoveDC")!;
var hann=Enum.ToObject(a.GetType("DevExtras.Common.Audio.WindowType")!,3);

var bytes=File.ReadAllBytes(args[0]);var input=new float[bytes.Length/4];Buffer.BlockCopy(bytes,0,input,0,bytes.Length);
var resamplerType=a.GetType("DevExtras.Common.Audio.Resample.AcceleratePolyphaseResampler")!;
var quality=Enum.ToObject(a.GetType("DevExtras.Common.Audio.Resample.AcceleratePolyphaseResamplerQuality")!,2);
var resampler=Activator.CreateInstance(resamplerType,new object[]{48000,8000,quality})!;
File.WriteAllText(args[1]+".resampler.json",System.Text.Json.JsonSerializer.Serialize(resamplerType.GetFields(BindingFlags.Instance|BindingFlags.NonPublic).Where(f=>new[]{"_taps","_phases","_rolloff","_beta"}.Contains(f.Name)).ToDictionary(f=>f.Name,f=>f.GetValue(resampler))));
var output=new float[input.Length/6+4096];var res=Call(resampler,"Process",input,0,input.Length,true,output,0,output.Length)!;
int consumed=(int)res.GetType().GetProperty("InputSamplesConsumed")!.GetValue(res)!;
int count=(int)res.GetType().GetProperty("OutputSamplesgenerated")!.GetValue(res)!;
var dest=new byte[count*4];Buffer.BlockCopy(output,0,dest,0,dest.Length);File.WriteAllBytes(args[1]+".f32",dest);
var funcs=NewFuncs(1024);var spectra=new List<float[]>();var normed=new List<float[]>();var times=new List<double>();var holds=new List<float>();var clockTimes=new List<double>();
var normal=funcsType.GetMethods().Single(m=>m.Name=="Normalise"&&m.GetParameters().Length==5);object[] normArgs={new float[513],new float[513],0f,new float[5],.995f};
var timer=System.Diagnostics.Stopwatch.StartNew();
for(int start=0;start+512<=count;start+=128){
 if(args.Length>2)while(timer.Elapsed.TotalSeconds<start/8000.0)Thread.Sleep(1);
 var pcm=new float[1024];Array.Copy(output,start,pcm,0,512);remove.Invoke(null,new object[]{funcs,pcm});window.Invoke(null,new object[]{funcs,hann,pcm,512});
 var fft=new float[1026];var db=new float[513];var values=new float[513];Call(funcs,"ComplexForward",1024,pcm,fft,true);Call(funcs,"CalculateMagnitudes",1024,false,true,fft,db);Call(funcs,"ConvertMagnitudesToDecibels",db,db,true);
 normArgs[0]=db;normArgs[1]=values;normal.Invoke(funcs,normArgs);
 clockTimes.Add((DateTime.UtcNow-DateTime.MinValue).TotalSeconds);holds.Add((float)normArgs[2]);spectra.Add(db);normed.Add(values);times.Add((start+256)/8000.0);
}
Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new{consumed,count,groupDelay=resamplerType.GetProperty("GroupDelaySamples")!.GetValue(resampler),times,clockTimes,holds,spectra,normed}));
