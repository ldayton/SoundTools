const {build}=require('../scripts/build-site.cjs'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const out=fs.mkdtempSync(path.join(os.tmpdir(),'soundglow-diagnostics-build-'));
try{
 const first=build({out,previous:path.join(out,'absent'),diagnosticsDsn:''}),second=build({out,previous:path.join(out,'absent'),diagnosticsDsn:'https://public@telemetry.invalid/1'});
 assert.notEqual(first.version,second.version,'Reporter configuration must invalidate the release');
 const html=fs.readFileSync(path.join(out,'index.html'),'utf8');assert(html.includes('name="soundglow-sentry-dsn" content="https://public@telemetry.invalid/1"'));
 const reporter=html.match(/data-reporter="([^"]+)"/)[1];assert(second.files.some(f=>f.url===reporter),'Reporter belongs to immutable manifest');
 for(const name of ['diagnostics/core.js','diagnostics/sentry.js','diagnostics/LICENSE','diagnostics/SENTRY-LICENSE'])assert(second.files.some(f=>f.url.endsWith('/'+name)),name);
 console.log('Diagnostics build config/manifest/license regressions passed');
}finally{fs.rmSync(out,{recursive:true,force:true})}
