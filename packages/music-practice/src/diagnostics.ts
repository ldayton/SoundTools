import { APP } from "./app-profile";
import { create, type Client } from "@ldayton/browser-diagnostics";
import reporterUrl from "@ldayton/browser-diagnostics/sentry.js?url";
let context: Record<string, unknown> = { view: "practice" };
export const diagnostics = create({
  app: APP.id,
  release: __PRACTICE_BUILD__,
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
      "patterns",
      "rhythm",
      "scales",
      "intervals",
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
if (typeof window !== "undefined") window.practiceDiagnostics = diagnostics;
declare global {
  const __PRACTICE_BUILD__: string;
  interface Window {
    practiceDiagnostics?: Client;
  }
}
