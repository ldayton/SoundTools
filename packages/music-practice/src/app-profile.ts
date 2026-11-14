/** Build-time identity: both applications share components, never saved state. */
declare const __PRACTICE_APP__: "notewise" | "songalong";
export type PracticeApp = "notewise" | "songalong";
export const APP_ID: PracticeApp =
  typeof __PRACTICE_APP__ === "undefined" ? "notewise" : __PRACTICE_APP__;
export const APP = {
  id: APP_ID,
  name: APP_ID === "songalong" ? "SongAlong" : "NoteWise",
  color: APP_ID === "songalong" ? "teal" : "violet",
  defaultMode: APP_ID === "songalong" ? ("sight" as const) : ("staff" as const),
};
export function belongsToApp(mode: string, app: PracticeApp = APP_ID) {
  return app === "songalong" ? mode === "sight" : mode !== "sight";
}
