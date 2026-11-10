import { getPianoVolume, setPianoVolume, pianoCreditsUrl } from "./piano-audio";
import {
  LIVE_EXERCISES,
  exercise,
  isLiveMode,
  type Mode,
  type LiveMode,
} from "./exercises";
import { navigationHTML, icon, type AppRoute } from "./navigation";
import type { Interruption } from "./live-practice";
import type { MidiState } from "./midi-input";
export function mountAppShell(
  element: HTMLElement,
  events: {
    navigate(url: URL, push: boolean): void;
    interrupt(reason: Interruption): void;
    inputChanged(): void;
  },
) {
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    element.querySelector<T>(selector)!;
  element.innerHTML =
    navigationHTML() +
    `<div class="app-body"><header class="app-topbar"><button class="nav-toggle" aria-label="Open navigation" aria-expanded="false" aria-controls="practice-navigation">${icon("menu")}</button><div class="page-heading"><p id="page-area"></p><h1 id="page-title" tabindex="-1"></h1></div><details class="keyboard-menu"><summary>${icon("keyboard")}<span>Keyboard</span><i class="midi-indicator" aria-hidden="true"></i></summary><div class="keyboard-popover"><div id="midi-panel"></div></div></details></header>
<p id="persistence-notice" role="alert" hidden></p><main id="practice-content" tabindex="-1"><section class="route-missing" hidden><h2>Page not found</h2><p>Choose an exercise from the navigation to keep practising.</p><a href="/piano/keys" data-mode="piano">Find piano keys →</a></section><p id="saved" class="saved" role="status">Opening saved practice…</p><div id="exercise-content">
${LIVE_EXERCISES.map((e) => `<div id="${e.rootId}" class="live-workspace" hidden></div>`).join("")}<div id="flashcards"></div></div><section class="settings-page" hidden aria-label="App settings"><section class="offline-section" aria-label="Offline use"><h2>Take it with you</h2><p id="offline-status" role="status">Saving for offline use…</p><div class="offline-actions"><button id="offline-retry" type="button" hidden>Retry offline setup</button><button id="offline-update" type="button" hidden>Update available</button></div></section><section class="sound-settings"><h2>Sound</h2><label for="piano-volume">Piano volume <output id="piano-volume-value" for="piano-volume">100</output></label><input id="piano-volume" type="range" min="0" max="100" step="1" value="100"></section><section class="privacy-settings"><h2>Privacy</h2></section><a class="sound-credits" href="${pianoCreditsUrl}" target="_blank" rel="noopener noreferrer">Piano recording credits</a></section></main></div>`;
  const volume = $<HTMLInputElement>("#piano-volume");
  const volumeValue = $("#piano-volume-value");
  volume.oninput = () => {
    volumeValue.textContent = volume.value;
    setPianoVolume(Number(volume.value));
  };
  const mobileNavigation = window.matchMedia("(max-width: 760px)");
  let navigationCollapsed = false;
  function syncNavigation() {
    const mobile = mobileNavigation.matches;
    document.body.classList.toggle(
      "navigation-collapsed",
      !mobile && navigationCollapsed,
    );
    $(".app-sidebar").inert = mobile
      ? !$(".app-sidebar").classList.contains("is-open")
      : navigationCollapsed;
    $(".nav-close").setAttribute(
      "aria-label",
      mobile ? "Close navigation" : "Collapse navigation",
    );
    $(".nav-close").title = mobile ? "Close navigation" : "Collapse navigation";
    $(".nav-toggle").setAttribute(
      "aria-expanded",
      String(
        mobile
          ? $(".app-sidebar").classList.contains("is-open")
          : !navigationCollapsed,
      ),
    );
  }
  function closeNavigation(focus = false) {
    $(".app-sidebar").classList.remove("is-open");
    $(".nav-shade").hidden = true;
    $(".nav-toggle").setAttribute("aria-expanded", "false");
    document.body.classList.remove("navigation-open");
    $(".app-body").inert = false;
    syncNavigation();
    events.inputChanged();
    if (focus) $(".nav-toggle").focus();
  }
  document.addEventListener("click", (e) => {
    const link = (e.target as Element).closest<HTMLAnchorElement>(
      "a[data-mode],a[data-settings],a.brand",
    );
    if (
      !link ||
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;
    e.preventDefault();
    events.navigate(new URL(link.href), true);
  });
  window.addEventListener("popstate", () =>
    events.navigate(new URL(location.href), false),
  );
  $(".nav-toggle").onclick = () => {
    if (!mobileNavigation.matches) {
      navigationCollapsed = false;
      syncNavigation();
      $(".nav-close").focus();
      return;
    }
    events.interrupt("controls");
    $(".app-sidebar").classList.add("is-open");
    $(".nav-shade").hidden = false;
    $(".nav-toggle").setAttribute("aria-expanded", "true");
    document.body.classList.add("navigation-open");
    syncNavigation();
    $(".app-body").inert = true;
    events.inputChanged();
    $(".nav-close").focus();
  };
  mobileNavigation.addEventListener("change", () => closeNavigation());
  $(".nav-close").onclick = () => {
    if (mobileNavigation.matches) closeNavigation(true);
    else {
      navigationCollapsed = true;
      syncNavigation();
      $(".nav-toggle").focus();
    }
  };
  syncNavigation();
  $(".nav-shade").onclick = () => closeNavigation(true);
  $<HTMLDetailsElement>(".keyboard-menu").addEventListener("toggle", () => {
    if ($<HTMLDetailsElement>(".keyboard-menu").open)
      events.interrupt("controls");
    events.inputChanged();
  });
  document.addEventListener("pointerdown", (e) => {
    if (
      $<HTMLDetailsElement>(".keyboard-menu").open &&
      !$(".keyboard-menu").contains(e.target as Node)
    ) {
      $<HTMLDetailsElement>(".keyboard-menu").open = false;
      events.inputChanged();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if ($<HTMLDetailsElement>(".keyboard-menu").open) {
        $<HTMLDetailsElement>(".keyboard-menu").open = false;
        $(".keyboard-menu summary").focus();
      }
      if ($(".app-sidebar").classList.contains("is-open"))
        closeNavigation(true);
    }
    if (e.key === "Tab" && $(".app-sidebar").classList.contains("is-open")) {
      const stops = [
        ...$(".app-sidebar").querySelectorAll<HTMLElement>("a,button"),
      ];
      const first = stops[0],
        last = stops.at(-1)!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  return {
    activityElement(mode: LiveMode) {
      return $("#" + LIVE_EXERCISES.find((e) => e.mode === mode)!.rootId);
    },
    get inputBlocked() {
      return (
        $(".app-sidebar").classList.contains("is-open") ||
        $<HTMLDetailsElement>(".keyboard-menu").open
      );
    },
    closeMenus() {
      closeNavigation();
      $<HTMLDetailsElement>(".keyboard-menu").open = false;
      events.inputChanged();
    },
    focusContent() {
      $("#page-title").focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    },
    reportMidi(state: MidiState) {
      $(".keyboard-menu").dataset.state = state;
      if (state === "connected") {
        $<HTMLDetailsElement>(".keyboard-menu").open = false;
        $(".keyboard-menu summary").focus({ preventScroll: true });
        queueMicrotask(events.inputChanged);
      }
      $(".midi-indicator").classList.toggle(
        "is-connected",
        state === "connected",
      );
      $(".keyboard-menu summary").setAttribute(
        "aria-label",
        state === "connected" ? "Keyboard connected" : "Keyboard connection",
      );
    },
    render(route: AppRoute, mode: Mode) {
      for (const definition of LIVE_EXERCISES)
        $("#" + definition.rootId).hidden =
          route.kind !== "exercise" || mode !== definition.mode;
      $("#flashcards").hidden = route.kind !== "exercise" || isLiveMode(mode);
      $("#practice-content").classList.toggle(
        "hymn-layout",
        route.kind === "exercise" && mode === "sight",
      );
      $("#practice-content").classList.toggle(
        "piano-layout-wide",
        route.kind === "exercise" && mode === "piano",
      );
      const current = exercise(mode);
      $("#page-area").textContent =
        route.kind === "settings" || route.kind === "not-found"
          ? "Note by Note"
          : current.area;
      $("#page-title").textContent =
        route.kind === "not-found"
          ? "Page not found"
          : route.kind === "settings"
            ? "Settings"
            : current.title;
      document.title = `${$("#page-title").textContent} · Note by Note`;
      $(".route-missing").hidden = !(route.kind === "not-found");
      $("#exercise-content").hidden =
        route.kind === "not-found" || !!(route.kind === "settings");
      $(".settings-page").hidden = !(route.kind === "settings");
      if (route.kind === "settings") {
        volume.value = String(getPianoVolume());
        volumeValue.textContent = volume.value;
      }
      if (route.kind === "settings")
        $(".settings-link").setAttribute("aria-current", "page");
      else $(".settings-link").removeAttribute("aria-current");
      document
        .querySelectorAll<HTMLAnchorElement>("nav [data-mode]")
        .forEach((link) => {
          if (
            !(route.kind === "not-found") &&
            !(route.kind === "settings") &&
            link.dataset.mode === mode
          )
            link.setAttribute("aria-current", "page");
          else link.removeAttribute("aria-current");
        });
    },
  };
}
