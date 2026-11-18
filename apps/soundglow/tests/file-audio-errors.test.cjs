const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path'),vm=require('node:vm'),esbuild=require('esbuild');
test('idle prefetch errors are reported, while requested read errors still reject normally',async()=>{
 const built=await esbuild.build({entryPoints:[path.resolve(__dirname,'../src/file-audio.js')],bundle:true,write:false,format:'iife',platform:'browser',plugins:[{
  name:'file-reader-contract',setup(build){
   build.onResolve({filter:/^(mediabunny|@soundtouchjs\/core)$/},args=>({path:args.path,namespace:'test'}));
   build.onLoad({filter:/.*/,namespace:'test'},({path})=>({contents:path==='mediabunny'?`
    export const ALL_FORMATS=[];
    export class BlobSource { constructor(_blob,options){globalThis.prefetch=options.handleUnhandledError;} }
    export class Input { constructor(){} async getPrimaryAudioTrack(){return {getSampleRate:async()=>48000,getNumberOfChannels:async()=>1,canDecode:async()=>true};} dispose(){} }
    export class AudioBufferSink { async *buffers(){throw new Error('Required read failed');} }
   `:'export class Stretch {}',loader:'js'}));
  }
 }]});
 const events=[],window={SoundglowDiagnostics:{event:code=>events.push(code)}};
 const context=vm.createContext({window,console});vm.runInContext(built.outputFiles[0].text,context);
 const reader=new window.SoundglowFileAudio.FileAudioReader(),blob={};await reader.open(blob);
 context.prefetch(new Error('Background read failed'));
 assert.deepEqual(events,['files.prefetch_read_failed']);
 await assert.rejects(async()=>{for await(const buffer of reader.buffers(blob,0,1))assert.fail('failed read returned samples');},/Required read failed/);
 reader.clear();
});
