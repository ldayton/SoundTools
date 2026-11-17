# Primary device targets

The shared practice-app layout checks use the profiles in `scripts/test-devices.cjs`:

| Target                            | CSS viewport                              | Rendering | Input              |
| --------------------------------- | ----------------------------------------- | --------- | ------------------ |
| MacBook Air 13-inch               | 1680 × 1050, Lily's chosen reference size | 2× Retina | Mouse and keyboard |
| iPhone 14 Pro, Safari portrait    | 393 × 660, with browser bars              | 3×        | Touch              |
| iPhone 14 Pro, Safari landscape   | 734 × 343, with browser bars              | 3×        | Touch              |
| iPhone 14 Pro, full-height layout | 393 × 852                                 | 3×        | Touch              |

WebKit is the primary iPhone rendering check. Chromium repeats the mobile checks as additional regression coverage. Firefox covers desktop and responsive resizing; it does not support Playwright's mobile emulation.

The full-height case covers the space available with browser bars hidden or an installed app; it does not simulate installation or every iOS safe-area/browser-chrome behavior. Emulation does not replace checks on a physical iPhone or its audio/MIDI hardware.

Additional narrow widths and breakpoint checks remain regression cases, not substitutes for these device targets. Keep device sizes centralized rather than adding different anonymous “mobile” sizes to each layout test.
