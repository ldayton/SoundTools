import {useCallback,useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore,type CSSProperties} from "react";
import {Popover,Alert,Button,Group,NavLink,Paper,SegmentedControl,Stack,Text,Title,Tooltip} from "@mantine/core";
import {useMediaQuery} from "@mantine/hooks";
import {ApplicationLayout,AppBrand,SidebarTools,SettingsNavigationLink} from "@ldayton/ui/application-layout";
import {PracticeOptionsProvider,PracticeWorkspace,usePracticeOptions} from "@ldayton/ui/practice-workspace";
import {ControlIcon} from "@ldayton/ui/control-icon";
import {ToolbarNumber} from "@ldayton/ui/toolbar-number";
import {SettingsSections} from "@ldayton/ui/settings-sections";
import {OfflineStatusPanel,CompleteUpdateButton} from "@ldayton/ui/offline-status-panel";
import {SwipePager} from "@ldayton/ui/swipe-pager";
import {BilingualMelody} from "@ldayton/music-practice/bilingual-melody";
import {hasMelody,readPreferences,resolveSelection,routeSelection,songPath,type Service,type ReaderPreferences} from "./model";
import {diagnostics,offline,offlineActions} from "./offline";
function ServiceSongs({service,selected,select}:{service:Service|undefined;selected?:string;select(id:string):void}) {
  const {closeMobile}=usePracticeOptions();
  return <Stack gap="xs" aria-label="Service song list">
    {service?.songs.map((item,index)=><div key={item.id}>
      {(index===0||service.songs[index-1].role!==item.role)&&<Text size="sm" fw={600} c="dimmed" mt={index?"md":0}>{item.role}</Text>}
      <NavLink label={item.title} active={item.id===selected} aria-current={item.id===selected?"page":undefined} component="a" href={songPath(service.id,item.id)} onClick={e=>{if(e.metaKey||e.ctrlKey)return;e.preventDefault();select(item.id);closeMobile();}} />
    </div>)}
    {!service?.songs.length&&<Text c="dimmed">No songs have been added yet.</Text>}
  </Stack>;
}
const storageKey="tagaluya:reader:v1";
export function Tagalujah({services}:{services:Service[]}) {
  const mobile=useMediaQuery("(max-width: 767px)",undefined,{getInitialValueInEffect:false});
  const [storageError,setStorageError]=useState(false);
  const [preferences,setPreferences]=useState<ReaderPreferences>(()=>{
    let saved={};try{saved=readPreferences(localStorage.getItem(storageKey));}catch{}
    const requested={...saved,...routeSelection(location.pathname)};
    const {service,song}=resolveSelection(services,requested);
    return {view:"interlinear",textSize:22,...saved,service:service?.id||"",song:song?.id||""};
  });
  const {service,song}=resolveSelection(services,preferences);
  const [settings,setSettings]=useState(location.pathname==="/settings");
  const [navigationOpen,setNavigationOpen]=useState(false),[navigationCollapsed,setNavigationCollapsed]=useState(false),[optionsOpen,setOptionsOpen]=useState(false);
  const title=useRef<HTMLHeadingElement>(null),anchor=useRef<string|undefined>(undefined),previousSong=useRef(song?.id);
  const cache=useSyncExternalStore(offline.subscribe,offline.getSnapshot);
  const mode=preferences.view==="melody"&&hasMelody(song)?"melody":"interlinear";
  const selectSong=useCallback((id:string)=>{
    setPreferences(p=>({...p,song:id}));setSettings(false);setNavigationOpen(false);
  },[]);
  useEffect(()=>{
    try{localStorage.setItem(storageKey,JSON.stringify({version:1,...preferences}));setStorageError(false);}catch{setStorageError(true);}
    if(!settings)history.replaceState(null,"",songPath(preferences.service,preferences.song||undefined));
  },[preferences,settings]);
  useEffect(()=>{
    const pop=()=>{setSettings(location.pathname==="/settings");const next=resolveSelection(services,routeSelection(location.pathname));setPreferences(p=>({...p,service:next.service?.id||p.service,song:next.song?.id||p.song}));};
    window.addEventListener("popstate",pop);return()=>window.removeEventListener("popstate",pop);
  },[services]);
  useLayoutEffect(()=>{
    if(previousSong.current!==song?.id){
      document.getElementById("practice-content")?.scrollTo({top:0});
      window.scrollTo({top:0});
      title.current?.focus({preventScroll:true});previousSong.current=song?.id;
    }
    if(anchor.current){document.getElementById(anchor.current)?.scrollIntoView({block:"start"});anchor.current=undefined;}
  },[song?.id,mode]);
  useEffect(()=>{window.dispatchEvent(new Event("soundtools:ready"));},[]);
  function changeView(view:string){
    const visible=[...document.querySelectorAll<HTMLElement>(".tagaluya-reader:not(.tagaluya-reader-preview) [data-phrase]")].find(p=>p.getBoundingClientRect().bottom>90);
    anchor.current=visible?.id;setPreferences(p=>({...p,view:view as ReaderPreferences["view"]}));
  }
  const navigation=<Stack h="100%" gap="sm">
    <Text size="sm" c="dimmed">Services</Text>
    {services.map(s=><NavLink key={s.id} label={new Intl.DateTimeFormat("en",{month:"long",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(s.date+"T12:00:00Z"))} description={s.title} active={!settings&&s.id===service?.id} component="a" href={songPath(s.id)} onClick={e=>{if(e.metaKey||e.ctrlKey)return;e.preventDefault();setPreferences(p=>({...p,service:s.id,song:s.songs[0]?.id||""}));setSettings(false);setNavigationOpen(false);}} />)}
    <SidebarTools><SettingsNavigationLink href="/settings" active={settings} onClick={e=>{e.preventDefault();history.pushState(null,"","/settings");setSettings(true);setNavigationOpen(false);}} /></SidebarTools>
  </Stack>;
  const sizeControl=<ToolbarNumber id="reading-size" label="Text size" icon={<span aria-hidden="true">Aa</span>} unit="px" value={preferences.textSize} min={18} max={36} step={2} onChange={textSize=>setPreferences(p=>({...p,textSize}))} />;
  const songs=<ServiceSongs service={service} selected={song?.id} select={selectSong}/>;

  function renderSong(song:NonNullable<typeof service>["songs"][number],active:boolean){
    let phraseIndex=0,previousKey="";
    return <Paper component="article" withBorder radius="md" p="lg" className={active?"tagaluya-reader":"tagaluya-reader-preview"} style={{"--reading-size":`${preferences.textSize}px`} as CSSProperties} aria-labelledby={active?"song-title":`song-title-${song?.id}`} lang="en">
        <Text size="sm" c="dimmed" mb="xs">{service?.title} · {service&&new Intl.DateTimeFormat("en",{month:"long",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(service.date+"T12:00:00Z"))}</Text>
        <Title ref={active?title:undefined} order={1} tabIndex={-1} id={active?"song-title":`song-title-${song?.id}`}>{song?.title||"Tagalujah"}</Title>
        {song?.credit&&<Text size="sm" c="dimmed" mt="xs">{song.credit}</Text>}
        {song?.status==="excerpt"&&<Text size="sm" c="dimmed" mt="xs">Opening excerpt</Text>}
        {storageError&&<Alert color="yellow" mt="md">Reading settings cannot be saved in this browser.</Alert>}
        {!song?.sections.length?<Text mt="xl" c="dimmed">Lyrics and translation have not been added for this song.</Text>:song.sections.map(section=><section key={section.id} className="song-section" aria-labelledby={`section-${song?.id}-${section.id}`}>
          <Title order={2} size="h4" id={`section-${song?.id}-${section.id}`}>{section.title}</Title>
          {section.phrases.map(phrase=>{
            const opening=phraseIndex++===0,key=phrase.melody?.abc.match(/^K:(.*)$/m)?.[1]||"",repeatKey=key!==previousKey;previousKey=key;
            return <div className="bilingual-phrase" id={`phrase-${song?.id}-${phrase.id}`} key={phrase.id} data-phrase={phrase.id}>
              {preferences.view==="melody"&&hasMelody(song)&&phrase.melody?<BilingualMelody abc={phrase.melody.abc} size={preferences.textSize} opening={opening} repeatKey={repeatKey}/>:<p className="original-line" lang={phrase.tagalog?"tl":"en"}>{phrase.tagalog||phrase.english}</p>}
              {phrase.tagalog&&<p className="translated-line" lang="en">{phrase.english}</p>}
            </div>;
          })}
        </section>)}
        {song?.sections.length ? <div className="song-ending" role="img" aria-label="End of song">
          <img src="/song-ending.svg" alt="" width="440" height="96" />
        </div> : null}
      </Paper>;
  }
  return <PracticeOptionsProvider entries={[{id:"songs",title:"Songs",form:songs}]} activeId={settings?undefined:"songs"} activityKey={service?.id} mobileDrawer onMobileOpenChange={setOptionsOpen}>
    <ApplicationLayout compact toolbarOnly={!settings} mobileToolbarHeight={56} brand={<AppBrand name="Tagalujah" icon="/icon.svg" />} title={settings?"Settings":"Tagalujah"} area="Service reader"
      navigation={navigation} navigationOpen={navigationOpen} navigationCollapsed={navigationCollapsed}
      onNavigationOpen={()=>setNavigationOpen(true)} onNavigationClose={()=>setNavigationOpen(false)} onNavigationCollapse={()=>setNavigationCollapsed(true)} onNavigationExpand={()=>setNavigationCollapsed(false)}
      blocked={navigationOpen||optionsOpen} mainClassName={settings?undefined:"tagaluya-workspace"} headerActions={settings?undefined:<Group gap="xs" wrap="nowrap" className="tagaluya-toolbar" aria-label="Reading controls">
        {mobile?<Popover position="bottom" withArrow shadow="md"><Popover.Target><Button variant="default" className="tagaluya-text-size" h={40} px={0} aria-label={`Text size, ${preferences.textSize} pixels`}><span className="tagaluya-text-size-icon" aria-hidden="true"><ControlIcon name="text-size" /></span><span className="tagaluya-text-size-value">{preferences.textSize}</span></Button></Popover.Target><Popover.Dropdown>{sizeControl}</Popover.Dropdown></Popover>:sizeControl}
        <Tooltip label={hasMelody(song)?"Choose reading view":"Melody has not been added for this song"} disabled={hasMelody(song)}><SegmentedControl aria-label="Reading view" value={mode} onChange={changeView} data={[{value:"interlinear",label:mobile?"Text":"Interlinear"},{value:"melody",label:mobile?"Score":"Melody",disabled:!hasMelody(song)}]} /></Tooltip>
      </Group>} updateAction={cache.updateAvailable?<CompleteUpdateButton onClick={offlineActions.update}/>:undefined}>
      <div hidden={settings} className="tagaluya-reading"><PracticeWorkspace><SwipePager enabled={mobile&&!settings} blocked={navigationOpen||optionsOpen} value={song?.id||""} onChange={selectSong} pages={(service?.songs||[]).map(song=>({id:song.id,content:renderSong(song,song.id===preferences.song)}))}/></PracticeWorkspace></div>
      {settings&&<SettingsSections consent={{id:"diagnostic-sharing",client:diagnostics}} offline={<OfflineStatusPanel status={cache.status} ready={cache.ready}>{cache.retryVisible&&<Button onClick={offlineActions.retry} disabled={cache.busy}>Retry offline save</Button>}</OfflineStatusPanel>} />}
    </ApplicationLayout>
  </PracticeOptionsProvider>;
}
