import test from "node:test";
import assert from "node:assert/strict";
import {services} from "../src/services";
import {adjacentSong,hasMelody,readPreferences,resolveSelection,routeSelection,validateServices} from "../src/model";
test("November 28 program retains all ten songs in service order and role groups",()=>{
  validateServices(services);const service=services[0];assert.equal(service.date,"2026-11-28");
  assert.deepEqual(service.songs.map(s=>s.id),["o-kay-saya-at-kay-ganda","he-is-lord","you-you-are-god","my-life-is-in-you-lord","salamat-panginoon","napakabuti-mo","karapat-dapat","jesus-you-are-glorious","i-give-you-glory","give-thanks"]);
  assert.equal(new Set(service.songs.map(s=>s.role)).size,7);
  assert.equal(adjacentSong(service,service.songs[0].id,-1),undefined);assert.equal(adjacentSong(service,service.songs.at(-1)!.id,1),undefined);
  assert.equal(adjacentSong(service,"he-is-lord",1)?.id,"you-you-are-god");
});
test("Tagalog translations stay paired, English choruses are not invented Tagalog lyrics",()=>{
  const lord=services[0].songs[1];assert(lord.sections[0].phrases.every(p=>p.tagalog===undefined));
  assert.deepEqual(lord.sections[2].phrases[0],{id:"he-is-lord-2-0",tagalog:"Siya ay Diyos, Siya ay Diyos",english:"He is God, He is God"});
  for(const song of services[0].songs){assert.equal(hasMelody(song),false);for(const p of song.sections.flatMap(s=>s.phrases))assert(!/genius|ads\.|Taylor Swift|You might also like/.test(p.english+(p.tagalog||"")));}
  assert.equal(services[0].songs[0].status,"excerpt");
});
test("reading links and invalid saved preferences recover safely",()=>{
  assert.deepEqual(readPreferences("bad"),{});assert.deepEqual(readPreferences('{"version":2}'),{});
  assert.equal(readPreferences('{"version":1,"textSize":999}').textSize,36);
  assert.equal(readPreferences('{"version":1,"textSize":null}').textSize,22);
  assert.deepEqual(routeSelection("/services/2026-11-28/he-is-lord"),{service:"2026-11-28",song:"he-is-lord"});
  assert.equal(resolveSelection(services,{service:"missing",song:"missing"}).song?.id,services[0].songs[0].id);
});
