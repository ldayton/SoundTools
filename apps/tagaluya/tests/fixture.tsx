import {createRoot} from "react-dom/client";
import {SoundToolsProvider} from "@ldayton/ui";
import {Tagaluya} from "../src/app";
import type {Service} from "../src/model";
import {practiceHymn} from "../../../packages/music-practice/test-fixtures/hymns";
import {arrangeHymn} from "../../../packages/music-practice/src/hymn-arrangements";
import "../src/style.css";
const melody=arrangeHymn(practiceHymn,"melody",4).abc;
const services:Service[]=[{id:"fixture",date:"2026-11-28",title:"Reader fixture",songs:[{id:"fixture-song",title:"Bilingual reading fixture",role:"Practice",status:"complete",sections:[{id:"fixture-section",title:"Verse",phrases:[
  {id:"fixture-first",tagalog:"Unang linya",english:"First line",melody:{abc:melody}},
  {id:"fixture-second",tagalog:"Ikalawang linya",english:"Second line",melody:{abc:melody}},
]}]}]}];
createRoot(document.getElementById("app")!).render(<SoundToolsProvider primaryColor="blue"><Tagaluya services={services}/></SoundToolsProvider>);
