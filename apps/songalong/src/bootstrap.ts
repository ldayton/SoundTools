import { bootAccountApp } from "@ldayton/ui/account-entry";
void bootAccountApp(
  { id: "songalong", name: "SongAlong", color: "teal" },
  () => import("./main"),
);
