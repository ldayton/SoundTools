// Prepare disposable browser inputs from checked-in fixtures; never regenerate goldens.
const fs=require('node:fs'),path=require('node:path');const {load}=require('./fixture.cjs');
const root=path.join(__dirname,'../..'),generated=path.join(__dirname,'generated');fs.mkdirSync(generated,{recursive:true});fs.writeFileSync(path.join(generated,'matched.f32'),load('english.f32.gz'));
const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8').replace('<head>','<head><base href="/dist/">').replace('</body>','<script src="/tests/visual/harness.js"></script></body>');fs.writeFileSync(path.join(generated,'harness.html'),html);
