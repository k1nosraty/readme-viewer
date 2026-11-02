# Size and UI checks

Reviewed on 2026-11-02. Small downloads are a product requirement; the full offline Mermaid
bundle, ELK layouts, mathematical labels, fonts and existing document features are retained.
The original Mermaid bundle is copied byte-for-byte into native assets.

## Size policy

Release builds use `opt-level = "s"`, LTO, a single codegen unit and symbol stripping.
Panic unwinding remains available. Tauri removes plugin commands excluded by capabilities;
existing command permissions are retained. Windows keeps LZMA compression and downloads the
WebView2 bootstrapper only if required, instead of embedding the WebView runtime.
The unused bridge source is excluded from native assets; runtime scripts and licenses remain.
These settings follow the [Tauri size guide](https://v2.tauri.app/concept/size/).

Android Preview keeps debug signing and WebView inspection, but optimizes Rust code and ships
one ABI per APK. The emulator checks the actual X86_64 package; the ARM64 package must have
matching application/version metadata and a valid signature. Both include the same app features.

Budgets live in `packaging/size-budgets.json`:

| Artifact | Maximum MiB |
| --- | ---: |
| Prepared frontend, all assets | 6 |
| Windows NSIS setup | 4 |
| Linux deb | 6.5 |
| Linux AppImage | 85 |
| Android ARM64 Preview | 40 |
| Android X86_64 Preview | 40 |

The [published v1.4.0 release](https://github.com/k1nosraty/readme-viewer/releases/tag/v1.4.0)
provides the reference measurements: Windows setup 4,010,610 bytes, deb 6,439,500 bytes,
AppImage 84,875,768 bytes and universal debug APK 61,024,244 bytes.
These are historical values, not measurements of the changed native builds.

The prepared frontend remains approximately 5.93 MiB uncompressed. Its reported gzip estimate
is only a comparison aid; it is not an installer-size measurement. Native builds must pass
their own artifact budgets before release. No reduced-size installer result is claimed until
those platform builds run.

```bash
npm run native:prepare
npm run size:check
node scripts/check-size.js windows
node scripts/check-size.js linux
node scripts/check-size.js android
```

Missing platform artifacts and exceeded budgets fail the check. Reports go to
`native-test-results/size-*.json` and the GitHub Actions step summary. Review the actual payload
before changing a budget; do not remove Mermaid features to make a size check pass.

## UI audit

The existing design tokens and layouts are retained. The review covers mouse, keyboard,
English/Persian, light/dark and viewports 1440×900, 760×400, 390×844 and 320×568.

| Severity | Finding | Resolution |
| --- | --- | --- |
| Critical | Menus could extend outside the viewport, particularly in RTL layouts. | Position menus against viewport bounds and limit their scroll height. |
| Critical | Ctrl+F could focus the hidden mobile Contents panel. | Open the mobile panel before focusing its filter. |
| Critical | Global shortcuts could change the source/view while a modal was open. | Guard background actions while Help or confirmation is active. |
| Warning | View labels overlapped in compact toolbars. | Allow natural button widths; use labelled icons at very narrow widths, with preview editing still available in Edit. |
| Warning | Help could return focus to a hidden toolbar button. | Return focus to the visible Help menu when its toolbar control is hidden. |
| Warning | Narrow dialogs could crowd actions; some Persian labels remained English. | Wrap actions, preserve mobile hit heights and translate split/pane metadata. |
| Opportunity | Long reading sessions and large drafts can benefit from further focused UX work. | Consider a distraction-free reading toggle and stronger opt-in draft recovery in a later version. |

`npm run test:browser` includes the visual smoke matrix. It checks actual menu hit testing,
label containment, overflow, modal isolation and focus return, and writes `ui-*.png` screenshots
to `native-test-results/`. The original diagram smoke checks still exercise offline layouts,
mathematics, embedded fonts and SVG/HTML export. Screenshots and reports are not packaged.

Chromium viewport emulation does not replace physical Android, Windows/WebView2, Linux/WebKit
or assistive-technology testing. Full platform builds require their normal SDK/system libraries.
