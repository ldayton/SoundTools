import {same,type Json} from "@ldayton/account/model";
import {canonicalHymnId, hymnSlug} from "./hymn-identity";
import { startPracticeAccount } from "./practice-account-binding";
import {
  songalongRecords,
  restoreSongalongRecords,
  songalongLiveKeys,
} from "./songalong-account-records";
import { MOBILE_SONGALONG_QUERY } from "./songalong-capabilities";
import { refreshPianoVolume, shutdownPianoSound } from "./piano-audio";
import { preventRepeatedButtonActivation } from "./input-guards";
import { mountAppShell } from "./app-shell";
import { SightReading } from "./sight-reading";
import { mountMidiPanel } from "./midi-panel";
import { readRoute } from "./navigation";
import { persistence } from "./persistence";
import { shellStatus } from "./shell-status";
import { diagnostics, diagnosticsContext } from "./diagnostics";
import { setupOffline } from "./offline";
import { offlineState } from "./offline-state";
import { restorePianoVisibility } from "./practice-piano";
import type { Interruption } from "./live-practice";
import "./style.css";
import "./styles/practice.css";
import "./styles/songalong.css";

function canonicalSongUrl(url:URL) {
 const prefix="/piano/hymns/";
 if(url.pathname.startsWith(prefix))url.pathname=prefix+hymnSlug(url.pathname.slice(prefix.length));
 return url;
}
const initialUrl=canonicalSongUrl(new URL(location.href));
if(initialUrl.pathname!==location.pathname)history.replaceState(null,"",initialUrl.pathname+initialUrl.search);
let route = readRoute(initialUrl, "sight");
let pendingLink = route.kind === "exercise" && route.hymn ? route : undefined;
let accountRestored=false;
let practice: SightReading | undefined;
let midi: ReturnType<typeof mountMidiPanel> | undefined;
let ready = false;
let renderFailed = false;
const mobileLayout = matchMedia(MOBILE_SONGALONG_QUERY);
const shell = mountAppShell(document.querySelector<HTMLElement>("#app")!, {
  shutdown() {
    renderFailed = true;
    ready = false;
    shutdownPianoSound();
    midi?.setAccepting(false);
    practice?.dispose();
  },
  navigate: visit,
  interrupt,
  inputChanged: refreshInput,
});
function syncMidi() {
  if (mobileLayout.matches) {
    midi?.dispose();
    midi = undefined;
    shell.reportMidi("idle");
    return;
  }
  if (midi) return;
  midi = mountMidiPanel(
    document.querySelector<HTMLElement>("#midi-panel")!,
    () => {},
    (state, error) => {
      if (state !== "connected") interrupt("connection");
      shell.reportMidi(state);
      diagnostics.event("midi.state", { midiState: state });
      if (
        error &&
        !["NotAllowedError", "SecurityError"].includes((error as Error).name)
      )
        diagnostics.capture(error, "midi.connection_failed", {
          midiState: state,
        });
    },
  );
  midi.setPerformanceMode(true);
  midi.setKeysListener((keys) => {
    if (acceptsInput()) practice?.showMidiKeys(keys);
  });
  midi.setPerformanceListener((note, held, timestamp) => {
    if (acceptsInput()) practice?.answer(note, held);
  });
  refreshInput();
}
syncMidi();
mobileLayout.addEventListener("change", syncMidi);

function acceptsInput() {
  return (
    !mobileLayout.matches &&
    !renderFailed &&
    ready &&
    persistence.writable &&
    route.kind === "exercise" &&
    !document.hidden &&
    document.hasFocus() &&
    !shell.inputBlocked
  );
}
function refreshInput() {
  midi?.setAccepting(
    acceptsInput() &&
      practice?.inputPolicy !== undefined &&
      practice.inputPolicy !== "none",
  );
}
function interrupt(reason: Interruption) {
  practice?.interrupt(reason);
  refreshInput();
}
function render() {
  if (renderFailed) return;
  diagnosticsContext({ mode: "sight", phase: ready ? "question" : "loading" });
  shell.render(route, "sight");
  practice?.leave();
  if (ready)
    practice ||= new SightReading(shell.activityElement("sight"), refreshInput);
  if (route.kind === "exercise" && ready && practice) {
    if (practice.applyRoute(route) === false) {
      route = { kind: "not-found" };
      shell.render(route, "sight");
    } else practice.enter();
  }
  refreshInput();
}
let guestDirty=false,guestApplying=false;
const guestView=(state:typeof persistence.state,id:string|undefined)=>{
  const saved=state.activities.sight as import("./hymn-progress").HymnState|undefined;
  const song=id && saved?.preferences?.[id];
  return {song:song && Object.fromEntries(Object.entries(song).filter(([key])=>!["mode","low","high","zoom","hymn","position"].includes(key))),mode:saved?.mode,low:saved?.low,high:saved?.high,zoom:saved?.zoomByLayout,presentation:state.activities.presentation,audio:state.activities.audio} as Json;
};
async function refreshGuest(){
  if(!guestDirty || guestApplying || persistence.accountSave || !practice?.syncIdle || document.hidden)return;
  guestApplying=true;guestDirty=false;
  try{
    const current=route.kind === "exercise" ? route.hymn : practice?.hymnId,before=guestView(persistence.state,current);
    if(!await persistence.refreshGuest())return;
    const saved=persistence.read<import("./hymn-progress").HymnState>("sight");
    if(saved)practice?.applyInactiveAccountState(saved);
    if(!same(before,guestView(persistence.state,current))){
      interrupt("controls");practice?.dispose();practice=undefined;
      refreshPianoVolume();restorePianoVisibility();
      if(current && route.kind === "exercise"){const url=new URL(`/piano/hymns/${hymnSlug(current)}`,location.origin);route=readRoute(url,"sight");history.replaceState(null,"",url.pathname);}
      render();
    }
  }catch(error){persistence.fail("Could not refresh saved song options.");diagnostics.capture(error,"songalong.guest_refresh_failed");}
  finally{guestApplying=false;}
}
persistence.guestListeners.add(()=>{guestDirty=true;void refreshGuest();});
const guestTimer=window.setInterval(()=>void refreshGuest(),500);
window.addEventListener("focus",()=>{guestDirty=true;void refreshGuest();});
window.addEventListener("pagehide",()=>clearInterval(guestTimer),{once:true});
function visit(url: URL, push: boolean) {
  url=canonicalSongUrl(url);
  interrupt("navigation");
  route = readRoute(url, "sight");
  if(!accountRestored && route.kind === "exercise" && route.hymn)pendingLink=route;
  if (push) history.pushState(null, "", url.pathname + url.search);
  shell.closeMenus();
  render();
  shell.focusContent();
}
shell.activityElement("sight").addEventListener("hymn-select", (event) => {
  const hymn = (event as CustomEvent<string>).detail;
  requestAnimationFrame(() =>
    visit(new URL("/piano/hymns/" + hymn, location.origin), true),
  );
});
shell.activityElement("sight").addEventListener("hymn-route", (event) => {
  if (route.kind !== "exercise") return;
  const url = new URL((event as CustomEvent<string>).detail, location.origin);
  if (location.pathname === url.pathname && location.search === url.search)
    return;
  if (location.pathname !== url.pathname)
    // Let the Select close before its containing mobile drawer begins closing.
    requestAnimationFrame(() => {
      if (location.pathname === url.pathname) shell.closeMenus();
    });
  if (
    location.pathname !== url.pathname &&
    !["/", "/index.html", "/piano/hymns"].includes(location.pathname)
  )
    history.pushState(null, "", url.pathname + url.search);
  else history.replaceState(null, "", url.pathname + url.search);
  route = readRoute(url, "sight");
});
window.addEventListener("keydown", preventRepeatedButtonActivation);
window.addEventListener("blur", () => {
  interrupt("focus");
  midi?.setAccepting(false);
});
window.addEventListener("focus", refreshInput);
window.addEventListener("pagehide", () => {
  mobileLayout.removeEventListener("change", syncMidi);
  practice?.dispose();
  midi?.dispose();
  shell.dispose();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
document.addEventListener("visibilitychange", () => interrupt("visibility"));
render();
void document.fonts.ready
  .then(async () => {
    await persistence.initialize();
    restorePianoVisibility();
    shellStatus.set({ blocked: !persistence.writable });
    ready = true;
    render();
    void startPracticeAccount({
      records: songalongRecords,
      restore: restoreSongalongRecords,
      pause: () => interrupt("controls"),
      canApply: () => route.kind === "settings" || !!practice?.syncIdle,
      liveKeys: (keys) => {
        const current = persistence.read<{ hymn?: string }>("sight")?.hymn;
        return songalongLiveKeys(keys, current ? canonicalHymnId(current) : undefined);
      },
      liveApplied: (_records, state) => {
        if (state.activities.sight)
          practice?.applyInactiveAccountState(
            state.activities.sight as import("./hymn-progress").HymnState,
          );
      },
      beforeApply: () => {
        interrupt("controls");
        practice?.dispose();
        practice = undefined;
      },
      applied: (records) => {
        const linked=!!records && pendingLink;
        if(records)accountRestored=true;
        const saved = persistence.read<{ hymn?: string }>("sight");
        if(linked){
          route=linked;pendingLink=undefined;
        } else if (route.kind === "exercise") {
          const url = new URL(
            "/piano/hymns" + (saved?.hymn ? "/" + hymnSlug(saved.hymn) : ""),
            location.origin,
          );
          history.replaceState(null, "", url.pathname);
          route = readRoute(url, "sight");
        }
        render();
        return !!linked || !!records && records.schema !== 2;
      },
    }).catch((error) => diagnostics.capture(error, "account.start_failed"));
    window.dispatchEvent(new Event("soundtools:ready"));
    try {
      setupOffline();
    } catch (error) {
      offlineState.set({
        status:
          "Offline setup isn’t available. Practice still works while connected.",
      });
      diagnostics.offline("setup", "failed", {}, error);
    }
  })
  .catch((error) => {
    diagnostics.capture(error, "songalong.startup_failed");
    shellStatus.set({
      blocked: true,
      error: "Practice couldn’t load. Reload to try again.",
    });
  });
