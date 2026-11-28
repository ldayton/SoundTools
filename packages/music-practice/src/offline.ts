import { APP } from "./app-profile";
import { setupShellOffline } from "@ldayton/browser-controls/shell-offline";
import { diagnostics } from "./diagnostics";
import { persistence } from "./persistence";
import { offlineState, offlineActions } from "./offline-state";
export function setupOffline() {
  return setupShellOffline({app:APP.id,offlineState,offlineActions,diagnostics,
    prepareUpdate:()=>persistence.prepareUpdate()});
}
