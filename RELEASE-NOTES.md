# README Viewer 1.4.0 — offline diagrams, math and fonts

## What's new

- **Full offline Mermaid:** flowcharts, sequence/ER/pie diagrams, mindmaps and architecture diagrams. Compare Dagre and ELK layouts without a CDN.
- **Mathematical labels:** powers, fractions, integrals and matrices use the bundled KaTeX engine and native MathML. SVG and self-contained HTML exports retain the formulas. An updated browser/system WebView with MathML is required; unsupported environments retain the source with an explanation.
- **Compact diagram controls:** source, expand and SVG download icons float in the diagram corner. Controls brighten on hover/focus and remain visible with 44px targets on touch screens. The approved 2px diagram frame keeps the current theme border color.
- **View > Appearance > Fonts:** independent Latin/other-script, Persian/Arabic and interface choices. Preset menus always show every option; select Other installed font to enter a local family name. Live preview, Apply, Cancel and defaults preserve the document.
- **Optional Vazirmatn:** the included variable font is licensed under SIL OFL 1.1 and loads only when selected. Other font files remain on the user's device. Included fonts are embedded in HTML/SVG exports; local fonts may look different on another device.
- **Updated demo:** Load sample document and docs/demo.md include seven diagram examples, mathematics, Persian/English content and interactive Markdown.

## Fixes and packaging

- Fix font suggestions disappearing after a previous choice.
- Remove extra diagram action bars and reveal source/copy controls below the diagram only when requested.
- Keep diagram output sanitised and isolated in images; embedded configuration, external diagram images and interactive diagram links remain disabled.
- Reuse existing application controls and add no runtime npm dependencies. Full Mermaid and the optional font add approximately 0.7–0.9 MB of compressed frontend assets over the Tiny build; actual installer sizes depend on platform packaging.
- Retain document tabs, independent undo/redo, two-document reading, local linked files, reading tools, native Save and appearance customization from 1.3.0.

## Downloads

- **Windows:** per-user NSIS `.exe`, Windows 10/11 with current WebView2. Unsigned installer; first installation needs internet if WebView2 must be installed.
- **Linux:** `.deb` and `.AppImage` for compatible systems using WebKitGTK 4.1.
- **Android Preview:** development-signed debug APK for ARM64/x86_64, Android 8.0+ with updated System WebView, distributed outside Play Store. Signing changes may require uninstall/reinstall; save documents outside the app first.

Desktop Save writes to the opened file. Android's first Save asks for a destination and writes a copy; later saves update that copy. Android content URIs may not provide relative image access or a display name. Local images that traverse parent directories remain blocked. Saves use UTF-8 and retain an existing UTF-8 BOM and LF/CRLF style.

Every download includes a SHA-256 checksum. Publication is gated on unit and real-browser tests, Linux installed-app open/edit/save/uninstall checks, Windows install/window-launch/uninstall checks, and Android signature/install/launch and emulator checks for Persian task editing, full-width Preview, rotation and Back-button confirmation. Installed Linux and Android WebViews also verify all seven diagrams, mathematical layout, the bundled font and repeated font selection. Physical Android providers, desktop file associations and additional Linux distributions still need hands-on review.


The second pane is read-only until opened in the main pane. A Markdown file-tree sidebar is not included. Appearance changes do not edit the Markdown source. Earlier releases remain available on the releases page.
