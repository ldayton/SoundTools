import { soundglowAccount } from "../account";
window.SoundglowAccount = soundglowAccount;
import { soundglowFiles } from "../cloud-files";
window.SoundglowFiles = soundglowFiles;
// SPDX-License-Identifier: GPL-3.0-or-later
import { mountApplicationShell } from "./application-shell";
import { LibraryActions } from "./library-actions";

// Stable DOM hosts must exist before the legacy audio bootstrap captures them.
window.SoundglowShell = mountApplicationShell();
window.SoundglowLibraryActions = LibraryActions;

import { bindMediaSession } from "@ldayton/ui/media-session";
import { connectPitchSettings } from "../pitch-settings-controller";
window.SoundglowControllers = { connectPitchSettings, bindMediaSession };
declare global {
  interface Window {
    SoundglowControllers: {
      connectPitchSettings: typeof connectPitchSettings;
      bindMediaSession: typeof bindMediaSession;
    };
  }
}
