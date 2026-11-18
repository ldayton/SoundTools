import { bootAccountApp } from "@ldayton/ui/account-entry";
void bootAccountApp(
  { id: "notewise", name: "NoteWise", color: "violet" },
  () => import("./main"),
);
