// Exercise the protocol test shipped with the exact GPL source, not a duplicate.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),archive=path.join(root,'dist/vendor/praat/source.tar.gz'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'soundglow-processor-'));
try{
 for(const name of ['processor.js','processor.test.cjs']){
  const bytes=execFileSync('tar',['-xOf',archive,'praat/wasm/'+name]);fs.writeFileSync(path.join(temporary,name),bytes);
  if(name==='processor.js')assert.deepEqual(bytes,fs.readFileSync(path.join(root,'dist/vendor/praat',name)),'Packaged and archived processor must match');
 }
 for(const name of ['frame-analysis.h','voice-analysis.h'])assert.deepEqual(execFileSync('tar',['-xOf',archive,'praat/wasm/'+name]),fs.readFileSync(path.join(root,'engine',name)),'Archived engine header must match '+name);
 execFileSync(process.execPath,[path.join(temporary,'processor.test.cjs')],{stdio:'inherit'});
 console.log('PASS: shipped processor protocol tests and source correspondence');
}finally{fs.rmSync(temporary,{recursive:true,force:true})}
