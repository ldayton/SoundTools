const {build}=require('../scripts/build-site.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'soundglow-diagnostics-build-'));
try{
 const first=build({out,previous:path.join(out,'absent'),diagnosticsDsn:''}),second=build({out,previous:path.join(out,'absent'),diagnosticsDsn:'https://public@telemetry.invalid/1'});
 assert.notEqual(first.version,second.version,'Reporter configuration must invalidate the release');
 const html=fs.readFileSync(path.join(out,'index.html'),'utf8');assert(html.includes('name="soundglow-sentry-dsn" content="https://public@telemetry.invalid/1"'));
 for(const name of ['ui/soundglow-ui.js','ui/soundglow-ui.css']){const file=second.files.find(f=>f.url.endsWith('/'+name));assert(file,'Compiled UI belongs to the immutable offline manifest: '+name);assert(html.includes(file.url),'HTML uses the same immutable UI URL: '+name);}
 assert(html.indexOf('/ui/soundglow-ui.js')<html.indexOf('/app.js'),'UI adapter loads before the audio controller');
 assert(!html.includes('src="library-actions.js"'),'No superseded imperative menu controller');
 const reporter=html.match(/data-reporter="([^"]+)"/)[1];assert(second.files.some(f=>f.url===reporter),'Reporter belongs to immutable manifest');
 for(const name of ['diagnostics/core.js','diagnostics/sentry.js','diagnostics/LICENSE','diagnostics/SENTRY-LICENSE'])assert(second.files.some(f=>f.url.endsWith('/'+name)),name);
 assert(![...second.files,...second.optional].some(f=>f.url.endsWith('.map')),'Public offline manifests must not require source maps');
 function checkPublic(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){assert(!entry.name.endsWith('.map'),'Public output must not contain source maps');if(entry.isDirectory())checkPublic(path.join(directory,entry.name));}}
 checkPublic(out);
 console.log('Diagnostics build config/manifest/license regressions passed');
}finally{fs.rmSync(out,{recursive:true,force:true})}
