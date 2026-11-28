import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import { guitarSustainAudio } from "../../../packages/music-practice/src/guitar-sustain";
import { playbackNotes } from "../../../packages/music-practice/src/hymn-playback";
import { swingAudio } from "../../../packages/music-practice/src/hymn-swing";
import {
  performNotes,
  pianoLayer,
  guitarLayer,
} from "../../../packages/music-practice/src/playback-performance";
import { inferGuitarPhrases, guitarExpressionAudio, guitarCadences } from "../../../packages/music-practice/src/guitar-phrasing";
const note = (pitch: number, start = 0, duration = 2) => ({
  pitch,
  start,
  duration,
  volume: 0.8,
});
test("piano voices melody, preserves score timing and selects recorded dynamics", () => {
  const source = [note(48), note(60), note(67), note(64, 3)];
  const result = performNotes(source, { instrument: "piano" });
  assert.deepEqual(
    result.map((n) => [n.pitch, n.start, n.duration]),
    source.map((n) => [n.pitch, n.start, n.duration]),
  );
  assert.ok(result[2].volume > result[0].volume);
  assert.equal(source[0].volume, 0.8);
  assert.deepEqual([0.2, 0.6, 0.9].map(pianoLayer), [4, 8, 12]);
});
test("fingerstyle respects edition strings and truncates a displaced string without reattacking ties", () => {
  const result = performNotes(
    [note(64, 0, 4), note(67, 2, 1), note(48, 0, 4)],
    {
      instrument: "guitar",
      positionFor: (p) =>
        p >= 64 ? { str: 0, num: p - 64 } : { str: 4, num: 3 },
    },
  );
  assert.equal(result[0].string, 5);
  assert.equal(result[1].string, 5);
  assert.equal(result[0].duration, 2);
  assert.equal(result[2].duration, 4);
  assert.equal(result.length, 3);
  assert.ok(result.every((n) => !n.delay));
});
test("guitar chords use distinct strings; only accompaniment strums and score ends stay fixed", () => {
  const source = [40, 47, 52, 55, 59, 64].map((p) => note(p));
  const strum = performNotes(source, { instrument: "guitar", strum: true });
  assert.equal(new Set(strum.map((n) => n.string)).size, 6);
  assert.equal(strum[0].delay, 0);
  assert(strum.every((n,i)=>i===0 || n.delay! > strum[i-1].delay!));
  assert(strum.at(-1)!.delay! > 0.025 && strum.at(-1)!.delay! < 0.065);
  assert.deepEqual(
    strum.map((n) => n.duration),
    source.map((n) => n.duration),
  );
  assert.ok(
    performNotes(source, { instrument: "guitar" }).every(
      (n) => n.delay === undefined,
    ),
  );
});

test("guitar gestures follow eighth-note upstrokes, pickups and compound beats without moving score attacks", () => {
  const chord=(start:number,volume=0.8)=>[40,47,52,55,59,64].map(p=>({...note(p,start,0.5),volume}));
  const source=[...chord(0),...chord(0.5),...chord(1)];
  const played=performNotes(source,{instrument:"guitar"});
  assert(played.every(n=>n.delay===undefined),"fingerpicked chords stay simultaneous");
  const strummed=performNotes(source,{instrument:"guitar",strum:true});
  assert.equal(strummed[0].delay,0);assert.equal(strummed[11].delay,0);assert.equal(strummed[12].delay,0);
  assert(strummed[6].delay!>strummed[11].delay!);
  assert.deepEqual(strummed.map(n=>[n.pitch,n.start,n.duration]),source.map(n=>[n.pitch,n.start,n.duration]));
  const pickup=performNotes(source,{instrument:"guitar",strum:true,pickup:0.5});
  assert.equal(pickup[5].delay,0);assert.equal(pickup[6].delay,0);
  const compound=performNotes([...chord(1),...chord(1.5)],{instrument:"guitar",strum:true,meter:"6/8"});
  assert.equal(compound[5].delay,0);assert.equal(compound[6].delay,0,"second dotted-quarter pulse is a downstroke");
  const eighth=performNotes([...chord(.25),...chord(.5)],{instrument:"guitar",strum:true,meter:"3/8"});
  assert.equal(eighth[5].delay,0);assert.equal(eighth[6].delay,0,"3/8 pulses on eighths, matching the practice clock");
  const cut=performNotes([...chord(1),...chord(2)],{instrument:"guitar",strum:true,meter:"2/2"});
  assert.equal(cut[5].delay,0);assert.equal(cut[6].delay,0,"cut time pulses on half notes");
  const soft=performNotes(chord(0,0.5),{instrument:"guitar",strum:true});
  assert(soft.at(-1)!.delay!>strummed[5].delay!,"stronger brushes cross the strings faster");
  assert.deepEqual([0.3,0.7,0.9].map(guitarLayer),[40,72,104]);
});

test("phrase inference needs musical evidence, respects real gaps, and leaves regular bar patterns unsegmented",()=>{
  const regular=Array.from({length:16},(_,i)=>({start:i,duration:1,pitch:60+i%3}));
  assert.deepEqual(inferGuitarPhrases(regular),[{start:0,end:16,lastStart:15}]);
  const melody=[...regular.slice(0,3),{start:3,duration:3,pitch:60,punctuation:true},
    {start:6,duration:1,pitch:67},{start:7,duration:1,pitch:65},{start:9,duration:2,pitch:60}];
  assert.deepEqual(inferGuitarPhrases(melody,[6]),[
    {start:0,end:6,lastStart:3},{start:6,end:8,lastStart:7},{start:9,end:11,lastStart:9},
  ]);
});

test("phrase dynamics and held-note taper retain pitches, attacks, ties, rests, bass and singer routing",()=>{
  const abc='X:1\nM:4/4\nL:1/4\n%%score (m b)\nV:m\nV:b\nK:C\n[V:m] "C" C D E G | c4- | c2 z2 |\n[V:b] C,4 | C,4 | C,4 |]';
  const source=abcjs.parseOnly(abc)[0].setUpAudio({qpm:60,chordsOff:true});
  const result=guitarExpressionAudio(source,[],new Set());
  const identity=(a:typeof source)=>a.tracks.map(t=>t.filter(n=>n.cmd==="note").map(n=>[n.pitch,n.start,n.duration]));
  assert.deepEqual(identity(result),identity(source));
  assert.equal(result.totalDuration,source.totalDuration);
  const shaped=playbackNotes(result), melody=shaped.filter(n=>n.pitch>=60);
  assert(melody[2].expressionGain!>melody[0].expressionGain!);
  assert.equal(melody.at(-1)!.endGain,0.94,"one gentle taper spans the held tie");
  assert(shaped.filter(n=>n.pitch<60).every(n=>n.endGain===undefined),"melody breathing does not damp the bass");
  const voiced={...source,tracks:source.tracks.map((track,i)=>i===0?track.map(n=>n.cmd==="note"?{...n,playbackInstrument:"choir"}:n):track)};
  const vocalResult=guitarExpressionAudio(voiced,[],new Set());
  assert.deepEqual(vocalResult.tracks[0],voiced.tracks[0]);
  assert.deepEqual(identity(vocalResult),identity(voiced));
  const mixed={...source,tracks:[source.tracks[0].map((n,i)=>n.cmd==="note"?{...n,playbackInstrument:i===1?"choir":"guitar"}:n)]};
  const mixedResult=guitarExpressionAudio(mixed,[],new Set());
  assert.deepEqual(mixedResult.tracks[0][1],mixed.tracks[0][1],"per-note singer routing is preserved even in a mixed track");
  const explicit={...source,tracks:source.tracks.map(track=>track.map(n=>n.cmd==="note"?{...n,playbackInstrument:"guitar"}:n))};
  assert(playbackNotes(guitarExpressionAudio(explicit,[],new Set())).some(n=>n.expressionGain!==undefined),"explicit guitar routing is supported");
  assert.deepEqual(guitarExpressionAudio(source,[],new Set()),result,"inference is repeatable");
});
test("out-of-range notes retain pitch and deterministic performance", () => {
  const source = [note(20), note(100)];
  assert.deepEqual(
    performNotes(source, { instrument: "guitar" }).map((n) => n.pitch),
    [20, 100],
  );
  assert.deepEqual(
    performNotes(source, { instrument: "guitar" }),
    performNotes(source, { instrument: "guitar" }),
  );
});

test("picking hand uses thumb and independent upper fingers, alternates plucks, and resets after space", () => {
  const source = [note(48), note(64), note(67), note(72), note(72, 1), note(72, 2), note(72, 4)];
  const played = performNotes(source, {instrument:"guitar", positionFor: p => ({str: ({48:5,64:2,67:1,72:0} as Record<number,number>)[p],num:0})});
  assert.deepEqual(played.map(n => n.pickingFinger), ["thumb","index","middle","ring","index","middle","index"]);
  assert(played[4].gain! > played[5].gain!, "alternation changes pluck energy without changing the recorded layer");
  assert.equal(played[4].gain, played[6].gain, "a separated phrase begins fresh");
  const crossing=performNotes([note(64,0),note(67,1),note(72,2)],{instrument:"guitar",positionFor:p=>({str:({64:2,67:1,72:0} as Record<number,number>)[p],num:0})});
  assert.deepEqual(crossing.map(n=>n.pickingFinger),["index","middle","index"],"alternation continues across string changes");
  assert.deepEqual(played.map(n => [n.pitch,n.start]), source.map(n => [n.pitch,n.start]));
  assert(performNotes(source,{instrument:"piano"}).every(n => !n.pickingFinger));
});

test("partial strums keep every authored note and weight bass downstrokes versus treble upstrokes", () => {
  const chord = (start:number) => [48,64,67].map(p => note(p,start,0.5));
  const positionFor = (p:number) => ({str: ({48:5,64:2,67:0} as Record<number,number>)[p],num:0});
  const down = performNotes(chord(0),{instrument:"guitar",strum:true,positionFor});
  const up = performNotes(chord(.5),{instrument:"guitar",strum:true,positionFor});
  assert.deepEqual(down.map(n=>n.string),[0,3,5]);
  assert.equal(down[0].delay,0);assert.equal(up[2].delay,0);
  assert(down[1].delay! > down[2].delay! / 2, "brush time follows skipped strings");
  assert(down[0].gain! / up[0].gain! > down[2].gain! / up[2].gain!);
  assert.deepEqual(up.map(n=>n.pitch),[48,64,67]);
});

test("cadences support held resolutions, including transposed minor keys, without splitting every chord change", () => {
  const chords=[{at:0,root:2,dominant:false},{at:1,root:9,dominant:true},{at:2,root:2,dominant:false}];
  assert.deepEqual(guitarCadences(chords,2),[2]);
  assert.deepEqual(guitarCadences(chords.map(c=>({...c,dominant:false})),2),[]);
  const melody=[{start:0,duration:1,pitch:62},{start:1,duration:1,pitch:64},{start:2,duration:2,pitch:69},
    {start:4,duration:2,pitch:62,cadence:true},{start:6,duration:1,pitch:65}];
  assert.deepEqual(inferGuitarPhrases(melody),[{start:0,end:6,lastStart:4},{start:6,end:7,lastStart:6}]);
  assert.equal(inferGuitarPhrases(melody.map(n=>({...n,cadence:false}))).length,1);
  const abc='X:1\nM:4/4\nL:1/4\nK:Dm\n"Dm" D E "A7/C#" A2 | "Dm" D2 F2 |]';
  const performed=ringing(abc);
  assert.equal(performed.find(n=>n.start===4)!.endGain,.94,"the held tonic is the phrase end, before the next motive");
});

test("contour shaping follows the melodic apex, keeps bass independent and respects compound pickups", () => {
  const abc='X:1\nM:6/8\nL:1/8\n%%score (m b)\nV:m\nV:b\nK:C\n[V:m] G | c2 G A B c | G6 |]\n[V:b] C, | C,6 | C,6 |]';
  const source=abcjs.parseOnly(abc)[0].setUpAudio({qpm:60,chordsOff:true});
  const shaped=playbackNotes(guitarExpressionAudio(source,[],new Set(),{meter:"6/8",pickup:.5}));
  const melody=shaped.filter(n=>n.role==="melody"),bass=shaped.filter(n=>n.role==="bass");
  assert(melody[1].expressionGain! > melody[0].expressionGain!);
  assert(bass.every(n=>n.endGain===undefined));
  assert(melody.some(n=>n.endGain===.94));
  assert.deepEqual(shaped.map(n=>[n.pitch,n.start,n.duration]),playbackNotes(source).map(n=>[n.pitch,n.start,n.duration]));
  const transposed={...source,tracks:source.tracks.map(t=>t.map(n=>n.cmd==="note"?{...n,pitch:n.pitch+5}:n))};
  assert.deepEqual(playbackNotes(guitarExpressionAudio(transposed,[],new Set(),{meter:"6/8",pickup:.5})).map(n=>n.expressionGain),shaped.map(n=>n.expressionGain),"transposing the motive preserves phrase shape");
});

test("inferred accents stay subtle and never promote a pluck into a harder sample layer", () => {
  // Straddle both recorded-layer thresholds after melody voicing. Written
  // dynamics must still reach all three recordings; inferred energy must not
  // change the choice even at those boundaries.
  const source = [.54,.56,.79,.81].map((volume,start)=>({...note(64,start,1),volume:volume/.92}));
  const plain=performNotes(source,{instrument:"guitar"});
  const accented=performNotes(source.map(n=>({...n,expressionGain:1.064})),{instrument:"guitar"});
  assert.deepEqual(accented.map(n=>guitarLayer(n.volume)),[40,72,72,104]);
  assert.deepEqual(accented.map(n=>n.volume),plain.map(n=>n.volume));
  assert(accented.every((n,i)=>n.gain!>plain[i].gain! && 20*Math.log10(n.gain!/plain[i].gain!)<.3));
  assert.deepEqual(accented.map(n=>[n.pitch,n.start,n.duration,n.string]),plain.map(n=>[n.pitch,n.start,n.duration,n.string]));

  const abc='X:1\nM:4/4\nL:1/4\nK:C\nC D E G | c2 G2 | C4 |]';
  const shaped=playbackNotes(guitarExpressionAudio(abcjs.parseOnly(abc)[0].setUpAudio({qpm:60,chordsOff:true}),[],new Set()));
  assert(shaped.every(n=>n.expressionGain!>=.95 && n.expressionGain!<=1.065),"inferred contour stays close to the underlying dynamic");
  const tail=shaped.find(n=>n.endGain!==undefined)!;
  assert(tail.endGain!<1 && 20*Math.log10(tail.endGain!)>-.75,"a phrase end tapers gently without isolating it");
  const chord=performNotes([48,64,67].map(p=>({...note(p),expressionGain:1.064})),{instrument:"guitar",strum:true});
  assert(chord.every(n=>20*Math.log10(n.gain!)<1),"chord presence and inferred emphasis together add less than 1 dB");
});

test("unassigned guitar melody replucks the high E string instead of climbing the neck to keep old notes ringing", () => {
  const notes=[note(64,0,1),note(67,1,1),note(64,2,1)].map(n=>({...n,ringUntil:4}));
  const played=performNotes(notes,{instrument:"guitar"});
  assert.deepEqual(played.map(n=>[n.string,n.fret,n.duration]),[[5,0,1],[5,3,1],[5,0,2]]);
});

test("vocal notes retain their instrument and sustain while the guitar strums and damps strings",()=>{
 const voice={instrument:"choir" as const,pitch:69,start:0,duration:4,volume:1};
 const source=[voice,{pitch:45,start:0,duration:1,volume:1},{pitch:52,start:0,duration:1,volume:1},{pitch:57,start:0,duration:1,volume:1},{pitch:45,start:1,duration:1,volume:1}];
 const result=performNotes(source,{instrument:"guitar",strum:true});
 assert.deepEqual(result[0],performNotes([voice],{instrument:"choir"})[0]);
 assert.equal(result[0].string,undefined);assert.equal(result[0].delay,undefined);assert.equal(result[0].duration,4);
 assert(result.slice(1).some(n=>(n.delay||0)>0));
});

function ringing(abc: string, swing = false) {
  const audio = abcjs.parseOnly(abc)[0].setUpAudio({qpm:60,chordsOff:true});
  return playbackNotes(guitarSustainAudio(swingAudio(audio,swing),abc,swing));
}
test("let ring joins separate strings, stops at changed harmony, and does not rewrite written rhythm", () => {
  const abc = 'X:1\nM:4/4\nL:1/4\nK:C\n"C" C E G E | "C" C E "F" F A |]';
  const source = ringing(abc);
  assert.deepEqual(source.slice(0,4).map(n=>n.duration),[1,1,1,1]);
  assert.deepEqual(source.map(n=>n.ringUntil),[6,6,6,6,6,6,8,8]);
  const played = performNotes(source, {instrument:"guitar",positionFor:p=>({str:({60:4,64:3,67:2,65:1,69:0} as Record<number,number>)[p],num:0})});
  assert.equal(played[0].duration,4,"bass rings until its string is replayed");
  assert.equal(played[1].duration,2,"repeated inner note replaces its earlier string");
  assert.equal(played[2].duration,4,"open harmony string rings until the F chord");
  assert.equal(source[2].duration,1,"written values remain unchanged");
});
test("voice rests, detached articulations, repeats and endings bound resonance", () => {
  const abc = 'X:1\nM:4/4\nL:1/4\nK:C\n|: "C" C E z G | .A B c2 :|';
  const notes = ringing(abc);
  assert.deepEqual(notes.map(n=>n.ringUntil),[2,2,8,5,8,8,10,10,16,13,16,16]);
  assert.equal(notes.at(-1)!.ringUntil,16);
  const polyphonic='X:1\nM:4/4\nL:1/4\n%%score (a b)\nV:a\nV:b\nK:C\n[V:a] C z E2 |\n[V:b] C,4 |]';
  const voices=ringing(polyphonic);
  assert.equal(voices.find(n=>n.pitch===60)!.ringUntil,1);
  assert.equal(voices.find(n=>n.pitch===48)!.ringUntil,4,"melody rest does not mute the bass");
});
test("swing boundaries follow the performed chord change and singer metadata stays untouched", () => {
  const abc='X:1\nM:4/4\nL:1/8\nK:C\n"C" C "F" F G6 |]';
  assert.equal(ringing(abc,true)[0].ringUntil,2/3);
  const audio=abcjs.parseOnly(abc)[0].setUpAudio({qpm:60,chordsOff:true});
  const voiced={...audio,tracks:audio.tracks.map(t=>t.map(n=>n.cmd==="note"?{...n,playbackInstrument:"choir"}:n))};
  assert.deepEqual(guitarSustainAudio(voiced,abc),voiced);
});
