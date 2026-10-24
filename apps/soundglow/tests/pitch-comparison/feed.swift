// Local supervised playback into BlackHole. Restores the previous input on exit.
import CoreAudio
import Foundation
import Synchronization
let root=URL(fileURLWithPath:CommandLine.arguments.count>1 ? CommandLine.arguments[1] : "outputs/pitch-comparison",isDirectory:true)
let run=try JSONSerialization.jsonObject(with:Data(contentsOf:root.appendingPathComponent("run.json"))) as! [String:Any]
let runId=run["runId"] as! String
func check(_ s:OSStatus,_ message:String)throws{if s != 0{throw NSError(domain:message,code:Int(s))}}
var listAddress=AudioObjectPropertyAddress(mSelector:kAudioHardwarePropertyDevices,mScope:kAudioObjectPropertyScopeGlobal,mElement:0),size:UInt32=0
try check(AudioObjectGetPropertyDataSize(1,&listAddress,0,nil,&size),"Device list");var devices=[UInt32](repeating:0,count:Int(size)/4)
try check(AudioObjectGetPropertyData(1,&listAddress,0,nil,&size,&devices),"Device list")
var device:UInt32=0
for d in devices{var a=AudioObjectPropertyAddress(mSelector:kAudioObjectPropertyName,mScope:kAudioObjectPropertyScopeGlobal,mElement:0);var name:Unmanaged<CFString>?;var n=UInt32(MemoryLayout<Unmanaged<CFString>?>.size);if AudioObjectGetPropertyData(d,&a,0,nil,&n,&name)==0,(name?.takeUnretainedValue() as String?)=="BlackHole 2ch"{device=d}}
guard device != 0 else{throw NSError(domain:"Install BlackHole 2ch before native comparison",code:1)}
var rateAddress=AudioObjectPropertyAddress(mSelector:kAudioDevicePropertyNominalSampleRate,mScope:kAudioObjectPropertyScopeGlobal,mElement:0),rate:Double=0;size=8
try check(AudioObjectGetPropertyData(device,&rateAddress,0,nil,&size,&rate),"Sample rate");guard rate==48000 else{throw NSError(domain:"BlackHole must use 48000 Hz",code:1)}
let bytes=try Data(contentsOf:root.appendingPathComponent("playlist.f32"));let pcm=bytes.withUnsafeBytes{Array($0.bindMemory(to:Float.self))}
guard !pcm.isEmpty&&bytes.count%4==0&&pcm.allSatisfy({$0.isFinite}) else{throw NSError(domain:"Invalid PCM",code:1)}
var input=AudioObjectPropertyAddress(mSelector:kAudioHardwarePropertyDefaultInputDevice,mScope:kAudioObjectPropertyScopeGlobal,mElement:0),original:UInt32=0;size=4
try check(AudioObjectGetPropertyData(1,&input,0,nil,&size,&original),"Original input");defer{var old=original;AudioObjectSetPropertyData(1,&input,0,nil,4,&old)}
try check(AudioObjectSetPropertyData(1,&input,0,nil,4,&device),"Select BlackHole");var actual:UInt32=0;try check(AudioObjectGetPropertyData(1,&input,0,nil,&size,&actual),"Verify input");guard actual==device else{throw NSError(domain:"Input route did not stick",code:1)}
let position=Atomic<Int>(0),stop=Atomic<Bool>(false);var proc:AudioDeviceIOProcID?
for sig in [SIGINT,SIGTERM]{signal(sig,SIG_IGN)}
let signals=[SIGINT,SIGTERM].map {sig -> DispatchSourceSignal in let s=DispatchSource.makeSignalSource(signal:sig,queue:.global());s.setEventHandler{stop.store(true,ordering:.relaxed)};s.resume();return s}
try check(AudioDeviceCreateIOProcID(device,{(_,_,_,_,output,_,_)->OSStatus in
 let pos=position.load(ordering:.relaxed);var frames=0
 for b in UnsafeMutableAudioBufferListPointer(output){if let data=b.mData{let ch=Int(b.mNumberChannels);if ch==0{continue};frames=Int(b.mDataByteSize)/4/ch;let p=data.assumingMemoryBound(to:Float.self);for f in 0..<frames{let value=pos+f<pcm.count ? pcm[pos+f]:0;for c in 0..<ch{p[f*ch+c]=value}}}}
 position.store(pos+frames,ordering:.relaxed);return noErr
},nil,&proc),"Create playback")
guard let proc=proc else{throw NSError(domain:"Missing playback callback",code:1)}
defer{AudioDeviceStop(device,proc);AudioDeviceDestroyIOProcID(device,proc);for s in signals{s.cancel()}}
if CommandLine.arguments.contains("--wait") {
 try JSONSerialization.data(withJSONObject:["phase":"ready","runId":runId,"ready":true,"inputDevice":device,"originalInput":original,"rate":rate]).write(to:root.appendingPathComponent("status.json"),options:.atomic)
 while !FileManager.default.fileExists(atPath:root.appendingPathComponent("start.flag").path) && !stop.load(ordering:.relaxed){Thread.sleep(forTimeInterval:0.025)}
}
try check(AudioDeviceStart(device,proc),"Start playback")
while position.load(ordering:.relaxed)<pcm.count && !stop.load(ordering:.relaxed){
 var current:UInt32=0;size=4;try check(AudioObjectGetPropertyData(1,&input,0,nil,&size,&current),"Check active input")
 guard current==device else{throw NSError(domain:"Default input changed during playback",code:1)}
 let state:[String:Any]=["phase":"running","currentInput":current,"runId":runId,"seconds":Double(position.load(ordering:.relaxed))/48000,"wall":Date().timeIntervalSince1970,"inputDevice":device,"originalInput":original,"rate":rate]
 try JSONSerialization.data(withJSONObject:state).write(to:root.appendingPathComponent("status.json"),options:.atomic);Thread.sleep(forTimeInterval:0.025)
}
try JSONSerialization.data(withJSONObject:["phase":"completed","runId":runId,"seconds":Double(position.load(ordering:.relaxed))/48000,"wall":Date().timeIntervalSince1970]).write(to:root.appendingPathComponent("status.json"),options:.atomic)
print("Playback ended; restoring input",original)
