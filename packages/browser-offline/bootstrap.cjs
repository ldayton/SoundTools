// Runs inside HTML: recovery must not depend on the script that failed to load.
function bootstrap() {
  const state = (window.__soundtoolsStartup = {
    interacted: false,
    ready: false,
  });
  for (const name of [
    "pointerdown",
    "keydown",
    "input",
    "change",
    "submit",
    "wheel",
  ])
    document.addEventListener(
      name,
      () => {
        state.interacted = true;
      },
      { capture: true, once: true },
    );
  let timer;
  function show() {
    if (state.ready || document.getElementById("startup-recovery")) return;
    const box = document.createElement("aside");
    box.id = "startup-recovery";
    box.setAttribute("role", "status");
    box.style.cssText =
      "position:fixed;z-index:99999;bottom:16px;left:16px;right:16px;max-width:480px;margin:auto;padding:16px;border:1px solid #aaa;border-radius:12px;background:#fff;color:#222;font:16px/1.5 system-ui;box-shadow:0 4px 24px #0003";
    const text = document.createElement("span");
    text.textContent = "Still loading. Check your connection or try again. ";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Try again";
    retry.onclick = () => location.reload();
    box.append(text, retry);
    document.body.append(box);
  }
  window.addEventListener(
    "soundtools:ready",
    () => {
      state.ready = true;
      const url = new URL(location.href);
      if (url.searchParams.has("__soundtools_update")) {
        url.searchParams.delete("__soundtools_update");
        history.replaceState(history.state, "", url.href);
      }
      clearTimeout(timer);
      document.getElementById("startup-recovery")?.remove();
    },
    { once: true },
  );
  timer = setTimeout(() => {
    if (document.body) show();
    else document.addEventListener("DOMContentLoaded", show, { once: true });
  }, 12000);
}
function startupHTML() {
  return "<script>(" + bootstrap.toString() + ")()</script>";
}
module.exports = { startupHTML };
