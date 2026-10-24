// Run in a consumer checkout after npm ci. No sibling checkout is needed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=process.cwd(),pin=JSON.parse(fs.readFileSync('vendor/browser-diagnostics.json','utf8'));
const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join('vendor',pin.artifact))).digest('hex');
assert.equal(hash,pin.sha256,'Diagnostics tarball does not match its pin');
assert.equal(require('./package.json').version,pin.version,'Installed diagnostics version does not match its pin');
const canonical=path.join(root,pin.sourceDirectory);
if(fs.existsSync(canonical)){
 for(const file of ['core.js','index.d.ts','sentry.js','LICENSE','SENTRY-LICENSE','sentry.js.LEGAL.txt'])assert(fs.readFileSync(path.join(canonical,file)).equals(fs.readFileSync(path.join(__dirname,file))),`Unreleased diagnostics change: ${file}; run the sync release tool`);
 const sourceHash=crypto.createHash('sha256');for(const file of ['src/sentry.js','package.json','package-lock.json'])sourceHash.update(file).update(fs.readFileSync(path.join(canonical,file)));assert.equal(sourceHash.digest('hex'),pin.sourceSha256,'Unreleased diagnostics source change; run the sync release tool');
}
if(fs.existsSync('dist/vendor/diagnostics/core.js'))for(const file of ['core.js','sentry.js','LICENSE','SENTRY-LICENSE','sentry.js.LEGAL.txt'])assert(fs.readFileSync(path.join(__dirname,file)).equals(fs.readFileSync(path.join(root,'dist/vendor/diagnostics',file))),`Diagnostics runtime copy differs: ${file}`);
console.log(`Verified ${pin.name}@${pin.version} (${hash.slice(0,12)})`);
