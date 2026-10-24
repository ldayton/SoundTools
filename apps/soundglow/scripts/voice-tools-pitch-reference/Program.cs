// Local reference capture. Requires the user's installed Voice Tools; ships no assemblies.
using System.Reflection;
using System.Runtime.Loader;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
var root="/Applications/VoiceTools.app/WrappedBundle";
AssemblyLoadContext.Default.Resolving+=(ctx,name)=>{var p=Path.Combine(root,name.Name+".dll");return File.Exists(p)?ctx.LoadFromAssemblyPath(p):null;};
var dll=root+"/DevExtras.Common.Audio.dll";var assembly=AssemblyLoadContext.Default.LoadFromAssemblyPath(dll);
var type=assembly.GetType("DevExtras.Common.Audio.Collections.TimeBasedFloatSamples")!;
var constructor=type.GetConstructors().Single();var mode=Enum.ToObject(constructor.GetParameters()[3].ParameterType,2);
var start=new DateTime(2020,1,1,0,0,0,DateTimeKind.Utc);
var cases=new Dictionary<string,double[][]>{
 ["steady"] = [[.01,200],[.03,200],[.11,200],[.19,200]],
 ["closest-not-mean"] = [[.01,200],[.03,220],[.11,300],[.13,205],[.15,250],[.21,400],[.23,220]],
 ["gaps-and-octave"] = [[.01,100],[.11,200],[.51,250],[1.51,180]],
 ["glide"] = Enumerable.Range(0,40).Select(i=>new[]{i*.01+0.001,120+i*4.0}).ToArray(),
 ["vibrato"] = Enumerable.Range(0,80).Select(i=>new[]{i*.01+.001,200+25*Math.Sin(i*.2)}).ToArray()
};
foreach(var filename in args){var extra=JsonSerializer.Deserialize<Dictionary<string,double[][]>>(File.ReadAllText(filename))!;foreach(var pair in extra)cases.Add(pair.Key,pair.Value);}
var results=new List<object>();
foreach(var (name,rows) in cases){
 var samples=constructor.Invoke([(uint)10,2000,100,mode]);type.GetField("_startTime",BindingFlags.Instance|BindingFlags.NonPublic)!.SetValue(samples,start);
 foreach(var row in rows)type.GetMethod("AddSample")!.Invoke(samples,[start.AddSeconds(row[0]),(float)row[1]]);
 var buckets=(Array)type.GetField("Buckets")!.GetValue(samples)!;var values=new List<object>();
 foreach(var bucket in buckets){var bt=bucket!.GetType();var value=bt.GetProperty("Value")!.GetValue(bucket);var time=bt.GetProperty("TimeStamp")!.GetValue(bucket);if(value!=null&&time!=null)values.Add(new{time=((DateTime)time-start).TotalSeconds,pitch=(float)value});}
 results.Add(new{name,rows,expected=values});
}
Console.WriteLine(JsonSerializer.Serialize(new{sha256=Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(dll))).ToLowerInvariant(),resolutionMs=100,mode=2,cases=results}));
