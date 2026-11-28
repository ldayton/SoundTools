import {createViewState} from "@ldayton/ui/view-state";
import {setupShellOffline,type ShellOfflineState} from "@ldayton/browser-controls/shell-offline";
import {create} from "@ldayton/browser-diagnostics";
import reporterUrl from "@ldayton/browser-diagnostics/sentry.js?url";
export const diagnostics=create({app:"tagaluya",release:__TAGALUJAH_RELEASE__,dsn:import.meta.env.VITE_SENTRY_DSN||"",sdkUrl:reporterUrl,environment:import.meta.env.PROD?"production":"development",enabled:import.meta.env.VITE_DEPLOY_ENV==="production"});
if(typeof window!=="undefined")window.practiceDiagnostics=diagnostics;
const model=createViewState<ShellOfflineState>({status:"Saving for offline use…",ready:false,retryVisible:false,busy:false,updateAvailable:false});
export const offline={...model,set:(patch:Partial<ShellOfflineState>)=>model.set({...model.getSnapshot(),...patch})};
export const offlineActions={retry:()=>{},update:()=>{}};
export function startOffline(){setupShellOffline({app:"tagaluya",offlineState:offline,offlineActions,diagnostics,prepareUpdate:()=>true});}
