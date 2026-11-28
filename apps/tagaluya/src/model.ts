export const readerTextSizeBounds = {min:8,max:36} as const;

export type Phrase = {id:string;tagalog?:string;english:string;melody?:{abc:string}};
export type SongSection = {id:string;title:string;phrases:Phrase[]};
export type Song = {id:string;title:string;role:string;status:"complete"|"excerpt"|"pending";sections:SongSection[];credit?:string};
export type Service = {id:string;date:string;title:string;songs:Song[]};
export type ReaderPreferences = {service:string;song:string;view:"interlinear"|"melody";textSize:number};
export function hasMelody(song:Song|undefined):boolean {
  const phrases=song?.sections.flatMap(s=>s.phrases)||[];
  return phrases.length>0 && phrases.every(p=>!!p.melody?.abc);
}
export function resolveSelection(services:Service[],input:Partial<ReaderPreferences>) {
  const service=services.find(s=>s.id===input.service)||services[0];
  const song=service?.songs.find(s=>s.id===input.song)||service?.songs[0];
  return {service,song};
}
export function adjacentSong(service:Service,current:string,direction:-1|1) {
  const index=service.songs.findIndex(s=>s.id===current);
  return index<0?undefined:service.songs[index+direction];
}
export function readPreferences(raw:string|null):Partial<ReaderPreferences> {
  try {
    const x=JSON.parse(raw||"null");if(x?.version!==1)return {};
    return {service:typeof x.service==="string"?x.service:undefined,song:typeof x.song==="string"?x.song:undefined,
      view:x.view==="melody"?"melody":"interlinear",textSize:typeof x.textSize==="number"&&Number.isFinite(x.textSize)?Math.max(readerTextSizeBounds.min,Math.min(readerTextSizeBounds.max,x.textSize)):22};
  }catch{return {};}
}
export function routeSelection(path:string) {
  const match=/^\/services\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?\/?$/.exec(path);
  return match?{service:match[1],song:match[2]}:{};
}
export function songPath(service:string,song?:string) {return `/services/${service}${song?`/${song}`:""}`;}
export function validateServices(services:Service[]) {
  const ids=new Set<string>();
  for(const service of services){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(service.date)||ids.has(service.id))throw Error("Invalid or duplicate service");ids.add(service.id);
    const songs=new Set<string>();
    for(const song of service.songs){
      if(songs.has(song.id)||!song.title.trim())throw Error("Invalid or duplicate song");songs.add(song.id);
      const phrases=new Set<string>();
      for(const section of song.sections)for(const phrase of section.phrases){
        if(phrases.has(phrase.id)||!phrase.english.trim()||phrase.tagalog!==undefined&&!phrase.tagalog.trim())throw Error("Invalid bilingual phrase");phrases.add(phrase.id);
      }
    }
  }
}
