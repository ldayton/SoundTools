const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const directory=path.join(__dirname,'fixtures');
const reference=JSON.parse(fs.readFileSync(path.join(directory,'reference.json')));
function load(name){const packed=fs.readFileSync(path.join(directory,name)),metadata=reference.assets[name];assert.equal(crypto.createHash('sha256').update(packed).digest('hex'),metadata.sha256,`Fixture changed: ${name}`);const bytes=zlib.gunzipSync(packed);assert.equal(bytes.length,metadata.decodedBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),metadata.decodedSha256);return bytes}
module.exports={reference,load};
