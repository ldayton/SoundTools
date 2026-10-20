// SPDX-License-Identifier: GPL-3.0-or-later
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),worker=require('./service-worker.cjs');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?files(path.join(directory,e.name)).map(f=>e.name+'/'+f):[e.name])}
function build({source=path.resolve('dist'),out=path.resolve('site'),base='/Soundglow/',previous=path.resolve('previous-site')}={}){
 if(!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))throw Error('Invalid deployment base');
 const sourceFiles=files(source),read=f=>fs.readFileSync(path.join(source,f));
 const hashGroup=list=>digest(Buffer.concat(list.flatMap(f=>[Buffer.from(f+'\0'),read(f)]))).slice(0,32);
 const engineFiles=sourceFiles.filter(f=>f.startsWith('vendor/praat/')&&!f.endsWith('source.tar.gz'));
 const mediaFiles=sourceFiles.filter(f=>f.startsWith('audio/'));
 const engine=base+'engines/'+hashGroup(engineFiles)+'/',media=base+'media/'+hashGroup(mediaFiles)+'/';
 const version=digest(Buffer.concat([Buffer.from(base),fs.readFileSync(__filename),fs.readFileSync(require.resolve('./service-worker.cjs')),...sourceFiles.flatMap(f=>[Buffer.from(f+'\0'),read(f)])])).slice(0,32);
 const release=base+'releases/'+version+'/',output=new Map();
 for(const file of engineFiles)output.set(engine+file.slice('vendor/praat/'.length),read(file));
 for(const file of mediaFiles)output.set(media+file.slice('audio/'.length),read(file));
 for(const file of ['pitch-contour.js','feature-state.js','workspace.js','settings-state.js','voice-feedback.js','performance.js','analysis-settings.js','style.css','praat-overlays.js','praat-display.js','praat-stream.js','pcm-worklet.js','updates.js'])output.set(release+file,read(file));
 let app=read('app.js').toString();
 for(const [before,after] of [["'vendor/praat/worker.js?profile=release&v=20261020-filtered'",JSON.stringify(engine+'worker.js?profile=release')],["'pcm-worklet.js'",JSON.stringify(release+'pcm-worklet.js')],["'audio/alice-waters.m4a'",JSON.stringify(media+'alice-waters.m4a')]]){
  if(app.split(before).length!==2)throw Error('Missing or duplicate production asset: '+before);app=app.replace(before,after);
 }
 output.set(release+'app.js',Buffer.from(app));
 let html=read('index.html').toString().replace('<head>','<head><meta name="soundglow-release" content="'+version+'"><meta name="soundglow-base" content="'+base+'">');
 const mappings={'pitch-contour.js':release+'pitch-contour.js','feature-state.js':release+'feature-state.js','workspace.js':release+'workspace.js','settings-state.js':release+'settings-state.js','voice-feedback.js':release+'voice-feedback.js','performance.js':release+'performance.js','analysis-settings.js':release+'analysis-settings.js','praat-overlays.js':release+'praat-overlays.js','style.css':release+'style.css','app.js':release+'app.js','updates.js':release+'updates.js','praat-display.js':release+'praat-display.js','praat-stream.js':release+'praat-stream.js','vendor/praat/client.js':engine+'client.js'};
 html=html.replace(/\b(src|href)="([^"?]+)(?:\?[^"]*)?"/g,(all,attribute,name)=>mappings[name]?attribute+'="'+mappings[name]+'"':all).replace('href="audio/CREDITS.txt"','href="'+media+'CREDITS.txt"');
 output.set(release+'index.html',Buffer.from(html));
 const manifest={schema:1,version,base,html:release+'index.html',files:[...output].map(([url,bytes])=>({url,sha256:digest(bytes),bytes:bytes.length}))};
 fs.rmSync(out,{recursive:true,force:true});fs.cpSync(source,out,{recursive:true});
 for(const [url,bytes] of output){const target=path.join(out,url.slice(base.length));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes)}
 const history=[{manifest,publishedAt:Date.now()}];
 const oldHistory=path.join(previous,'release-history.json');
 if(fs.existsSync(oldHistory)){
  const old=JSON.parse(fs.readFileSync(oldHistory));
  for(const [index,entry] of old.entries()){
   const pack=entry.manifest;
   if(pack.version===version||pack.base!==base||index>=3&&Date.now()-entry.publishedAt>86400000)continue;
   for(const file of pack.files){
    if(![base+'releases/',base+'engines/',base+'media/'].some(prefix=>file.url.startsWith(prefix))||file.url.includes('..'))throw Error('Invalid retained asset');
    const relative=file.url.slice(base.length),bytes=fs.readFileSync(path.join(previous,relative));
    if(digest(bytes)!==file.sha256)throw Error('Retained asset integrity mismatch');
    const target=path.join(out,relative);fs.mkdirSync(path.dirname(target),{recursive:true});if(!fs.existsSync(target))fs.writeFileSync(target,bytes);
   }
   history.push(entry);
  }
 }
 fs.writeFileSync(path.join(out,'release-history.json'),JSON.stringify(history));
 fs.writeFileSync(path.join(out,'index.html'),html);fs.writeFileSync(path.join(out,'release.json'),JSON.stringify(manifest));fs.writeFileSync(path.join(out,'sw.js'),worker(manifest));fs.writeFileSync(path.join(out,'.nojekyll'),'');
 return manifest;
}
module.exports={build};if(require.main===module){const manifest=build();console.log('Packaged Soundglow release '+manifest.version+' ('+manifest.files.length+' immutable assets)')}
