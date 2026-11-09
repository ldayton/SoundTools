import { create, attachPanel, type Client } from "@ldayton/browser-diagnostics";
import reporterUrl from "@ldayton/browser-diagnostics/sentry.js?url";
let context: Record<string, unknown> = { view: "practice" };
export const diagnostics = create({
  app: "notecards",
  release: __NOTECARDS_BUILD__,
  dsn: import.meta.env.VITE_SENTRY_DSN || "",
  sdkUrl: reporterUrl,
  enabled: import.meta.env.VITE_DEPLOY_ENV === "production",
  environment: import.meta.env.PROD ? "production" : "development",
  fields: {
    mode: [
      "staff",
      "name",
      "find",
      "staff-find",
      "tab",
      "piano",
      "signature",
      "sight",
    ],
    midiState: [
      "unsupported",
      "idle",
      "requesting",
      "waiting",
      "opening",
      "connected",
      "denied",
      "error",
    ],
    phase: ["loading", "question", "feedback", "complete", "empty"],
    roundLength: "number",
    minFret: "number",
    maxFret: "number",
    stringCount: "number",
  },
  snapshot: () => context,
});
export function diagnosticsContext(value: Record<string, unknown>) {
  context = { view: "practice", ...value };
}
export function mountDiagnostics(parent: HTMLElement) {
  return attachPanel(diagnostics, parent);
}
if (typeof window !== "undefined") window.notecardsDiagnostics = diagnostics;
declare global {
  const __NOTECARDS_BUILD__: string;
  interface Window {
    notecardsDiagnostics?: Client;
  }
}
