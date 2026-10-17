// Independent original-library oracle; preparation verifies bytes, never regenerates it.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const directory=path.join(__dirname,'fixtures/voice-tools'),manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
function load(name){
 const metadata=manifest.assets[name],packed=fs.readFileSync(path.join(directory,name));
 const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 assert.equal(sha(packed),metadata.sha256,`Voice Tools fixture changed: ${name}`);
 const bytes=zlib.gunzipSync(packed);assert.equal(bytes.length,metadata.decodedBytes);assert.equal(sha(bytes),metadata.decodedSha256);return bytes;
}
module.exports={manifest,load};
