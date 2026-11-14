// SPDX-License-Identifier: GPL-3.0-or-later
import { mountApplicationShell } from "./application-shell";
import { LibraryActions } from "./library-actions";

// Stable DOM hosts must exist before the legacy audio bootstrap captures them.
window.SoundglowShell = mountApplicationShell();
window.SoundglowLibraryActions = LibraryActions;
