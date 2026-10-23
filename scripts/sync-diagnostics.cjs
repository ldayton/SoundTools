// Explicit release tool: npm package consumers never import a sibling checkout.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),source=path.join(root,'packages/browser-diagnostics'),version=require(source+'/package.json').version;
const target=process.argv[2]&&path.resolve(process.argv[2]);
cp.execFileSync('npm',['run','build'],{cwd:source,stdio:'inherit'});
cp.execFileSync('npm',['pack',source,'--pack-destination',path.join(root,'vendor')],{cwd:root,stdio:'inherit'});
const sourceHash=crypto.createHash('sha256');for(const file of ['src/sentry.js','package.json','package-lock.json'])sourceHash.update(file).update(fs.readFileSync(path.join(source,file)));const sourceSha256=sourceHash.digest('hex');
const name='ldayton-browser-diagnostics-'+version+'.tgz',tarball=fs.readFileSync(path.join(root,'vendor',name));
for(const project of [root,...(target?[target]:[])]){
 fs.mkdirSync(path.join(project,'vendor'),{recursive:true});if(project!==root)fs.writeFileSync(path.join(project,'vendor',name),tarball);
 cp.execFileSync('npm',['install','--save-exact','--ignore-scripts','--force','./vendor/'+name],{cwd:project,stdio:'inherit'});
 if(project===root){const output=path.join(project,'dist/vendor/diagnostics');fs.mkdirSync(output,{recursive:true});for(const file of ['core.js','sentry.js','LICENSE','SENTRY-LICENSE','sentry.js.LEGAL.txt'])fs.copyFileSync(path.join(source,file),path.join(output,file));}
 fs.writeFileSync(path.join(project,'vendor/browser-diagnostics.json'),JSON.stringify({name:'@ldayton/browser-diagnostics',version,sha256:crypto.createHash('sha256').update(tarball).digest('hex'),sourceRepository:'https://github.com/ldayton/Soundglow',sourceDirectory:'packages/browser-diagnostics',sourceSha256,artifact:name},null,2)+'\n');
}
