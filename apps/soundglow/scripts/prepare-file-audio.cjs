const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist/vendor/file-audio');fs.mkdirSync(out,{recursive:true});
esbuild.buildSync({entryPoints:[path.join(root,'src/file-audio.js')],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,sourcemap:'external',sourcesContent:true,legalComments:'linked',outfile:path.join(out,'file-audio.js')});
for(const [name,label] of [['mediabunny','MEDIABUNNY'],['@soundtouchjs/core','SOUNDTOUCH']]){let dir=path.dirname(require.resolve(name));while(!fs.existsSync(path.join(dir,'LICENSE'))&&path.dirname(dir)!==dir)dir=path.dirname(dir);fs.copyFileSync(path.join(dir,'LICENSE'),path.join(out,label+'-LICENSE'));}
