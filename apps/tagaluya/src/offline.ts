import {createViewState} from "@ldayton/ui/view-state";
import {setupShellOffline,type ShellOfflineState} from "@ldayton/browser-controls/shell-offline";
import {create} from "@ldayton/browser-diagnostics";
export const diagnostics=create({app:"tagaluya",release:import.meta.env.VITE_RELEASE||"local",environment:import.meta.env.PROD?"production":"development",enabled:false});
const model=createViewState<ShellOfflineState>({status:"Saving for offline use…",ready:false,retryVisible:false,busy:false,updateAvailable:false});
export const offline={...model,set:(patch:Partial<ShellOfflineState>)=>model.set({...model.getSnapshot(),...patch})};
export const offlineActions={retry:()=>{},update:()=>{}};
export function startOffline(){setupShellOffline({app:"tagaluya",offlineState:offline,offlineActions,diagnostics,prepareUpdate:()=>true});}
