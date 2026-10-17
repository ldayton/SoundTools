// Prepare disposable browser inputs from checked-in fixtures; never regenerate goldens.
const fs=require('node:fs'),path=require('node:path');const {load}=require('./fixture.cjs');
const root=path.join(__dirname,'../..'),generated=path.join(__dirname,'generated');fs.mkdirSync(generated,{recursive:true});fs.writeFileSync(path.join(generated,'matched.f32'),load('english.f32.gz'));
const html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8').replace('<head>','<head><base href="/dist/">').replace('</body>','<script src="/tests/visual/harness.js"></script></body>');fs.writeFileSync(path.join(generated,'harness.html'),html);

const speech=fs.readFileSync(path.join(root,'dist/audio/speech-english.wav'));
let rate,pcm;for(let at=12;at+8<=speech.length;){const kind=speech.toString('ascii',at,at+4),size=speech.readUInt32LE(at+4);if(kind==='fmt ')rate=speech.readUInt32LE(at+12);if(kind==='data')pcm=speech.subarray(at+8,at+8+size);at+=8+size+(size%2)}
const count=Math.floor(pcm.length/2*48000/rate),capture=Buffer.alloc(44+count*2);
capture.write('RIFF');capture.writeUInt32LE(capture.length-8,4);capture.write('WAVEfmt ',8);capture.writeUInt32LE(16,16);capture.writeUInt16LE(1,20);capture.writeUInt16LE(1,22);capture.writeUInt32LE(48000,24);capture.writeUInt32LE(96000,28);capture.writeUInt16LE(2,32);capture.writeUInt16LE(16,34);capture.write('data',36);capture.writeUInt32LE(count*2,40);
for(let i=0;i<count;i++){const x=i*rate/48000,a=Math.floor(x),b=Math.min(a+1,pcm.length/2-1);capture.writeInt16LE(Math.round(pcm.readInt16LE(a*2)*(1-x+a)+pcm.readInt16LE(b*2)*(x-a)),44+i*2)}
const microphone=path.join(generated,'capture.wav');fs.writeFileSync(microphone,capture);

// Original Voice Tools oracle: these are independently captured, hash-pinned assets.
const voice=require('./voice-fixture.cjs');
fs.writeFileSync(path.join(generated,'voice-speech.f32'),voice.load('speech.f32.gz'));
fs.writeFileSync(path.join(generated,'voice-reference.json'),voice.load('reference.json.gz'));
const voiceHtml=fs.readFileSync(path.join(root,'dist/index.html'),'utf8').replace('<head>','<head><base href="/dist/">').replace('</body>','<script src="/tests/visual/voice-harness.js"></script></body>');
fs.writeFileSync(path.join(generated,'voice.html'),voiceHtml);
