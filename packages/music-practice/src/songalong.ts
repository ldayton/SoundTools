import { startPracticeAccount } from "./practice-account-binding";
import {
  songalongRecords,
  restoreSongalongRecords,
} from "./songalong-account-records";
import { MOBILE_SONGALONG_QUERY } from "./songalong-capabilities";
import { shutdownPianoSound } from "./piano-audio";
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

let route = readRoute(new URL(location.href), "sight");
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
    (state) => {
      if (state !== "connected") interrupt("connection");
      shell.reportMidi(state);
      diagnostics.event("midi.state", { midiState: state });
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
function visit(url: URL, push: boolean) {
  interrupt("navigation");
  route = readRoute(url, "sight");
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
      beforeApply: () => {
        interrupt("controls");
        practice?.dispose();
        practice = undefined;
      },
      applied: () => {
        const saved = persistence.read<{ hymn?: string }>("sight");
        if (route.kind === "exercise") {
          const url = new URL(
            "/piano/hymns" + (saved?.hymn ? "/" + saved.hymn : ""),
            location.origin,
          );
          history.replaceState(null, "", url.pathname);
          route = readRoute(url, "sight");
        }
        render();
      },
    }).catch(() => diagnostics.event("account.start_failed"));
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
