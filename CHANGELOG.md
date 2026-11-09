# Changelog

## Unreleased

## 1.6.0 — 2026-11-09

- Share the desktop title bar and workspace styling between Windows and Linux. Add adjustable title-bar opacity where transparency is available and installed-font suggestions in Appearance.
- Add resizable vertical tabs, drag and keyboard reordering, Ctrl+Tab navigation, and an All tabs list when the horizontal title bar runs out of room.
- Keep File, Edit, View and Help visible while commands scroll. Group file settings, surface Appearance earlier in View, and give document search and the Contents filter distinct commands.
- Put Focus directly on the toolbar and keep Contents visible on narrow windows. Make Save work on non-English keyboard layouts.
- Consolidate native startup scripts and show the desktop window before draft restoration finishes. Avoid copying the compared document on unrelated UI updates and batch native window-state reads during resizing.
- Retry transient Gradle downloads and AppImage bundling without repeating the Linux compilation.

## 1.5.1 — 2026-11-02

- Fix native compilation of updater configuration by declaring the existing `serde_json` crate as a direct dependency for `tauri::generate_context!`.

## 1.5.0 — 2026-11-02

- Add Help → Check for updates, automatic in-app release notices, version-bound signed desktop updates and the native release manifest pipeline. Keep a stable Android Preview signing identity for APK upgrades.
- Add a localized About dialog with the installed version and developer link to github.com/k1nosraty.
- Add opt-in transactional recovery for large drafts, bounded autosave during typing, legacy migration, native close flushing and preservation of the last committed copy on storage failure.
- Add distraction-free reading with F8/Esc, a visible exit control and restoration of the previous workspace without changing saved view preferences.
- Optimize native Release builds for size with LTO, one codegen unit and symbol stripping; prune disallowed plugin commands and keep full offline Mermaid, ELK, math and fonts.
- Build optimized debug Android Preview APKs separately for ARM64 and X86_64; enforce frontend and installer size budgets with CI summaries and JSON reports.
- Keep menus within the viewport in both interface directions, make the mobile Contents shortcut reveal its panel, and prevent modal shortcuts from editing the background document.
- Fix overlapping view-mode labels on compact toolbars, return Help focus to a visible control, wrap narrow dialog actions and complete Persian pane labels.
- Add a visual UI smoke matrix covering English/Persian, light/dark, desktop/mobile/landscape and keyboard focus without introducing runtime dependencies.
- Reuse unchanged preview blocks and sanitized HTML while preserving Markdown counters, source mapping, expanded details, focused controls and rendered diagrams.
- Stage desktop saves in a temporary sibling file, flush complete contents, then replace the destination; preserve Unix permissions and symlink targets.
- Detect external file changes before saving and offer Overwrite, Save as or Cancel. Desktop commits compare SHA-256 revisions again after staging.
- Prevent document styles and application-like classes from covering the viewer interface.
- Fix colliding numbered heading anchors, lazy language loading across multiple blocks, native embedded images and binary detection after successful Unicode decoding.
- Bound syntax-highlight cache storage by both entry count and estimated bytes; run atomic-save Rust tests on Linux and Windows CI, including the `audit` branch.

## 1.4.0

- Give diagrams the approved 2px frame while retaining the current theme border color; preserve the same frame in standalone HTML.

- Fix font pickers hiding other choices after selection: use persistent preset menus with a separate custom installed-family field, all inside Appearance.

- Replace diagram action bars with floating icon controls, hover/focus visibility, touch targets and an icon-based layout picker; reveal source/copy controls below the diagram only when requested.

- Render mathematical Mermaid labels (powers, fractions, integrals and matrices) with the existing KaTeX engine and native MathML; preserve sanitisation, offline SVG/HTML exports and source fallback.

- Render full Mermaid diagrams offline in Preview, Split and the second reading pane.
- Add source toggling, expanded zoom view and platform SVG downloads; embed diagrams in standalone HTML exports and native browser snapshots.
- Keep diagram SVG/CSS isolated in images, reject embedded configuration/external resources, retain invalid source, and cache rendering within a bounded budget.
- Bundle Mermaid 11.17.2 with ELK 0.2.2, mindmaps and architecture support; expose Dagre/ELK selection for flowcharts.
- Add independent Latin/other-script, Persian/Arabic and interface fonts with live preview, cancel/reset and persistent settings.
- Include an optional OFL-licensed Vazirmatn variable font; keep other font files on the user’s system, preserve monospace code and embed the included face in HTML/SVG exports when selected.

## 1.3.0

- Add independent document tabs with per-tab editing history, unsaved-change protection and optional session restoration.
- Add a resizable second reading pane and link actions for the current tab, a new tab or the browser.
- Add bookmarks, reading-position restoration, section folding, completed-task filtering and a collapsible Contents tree.
- Add File / Edit / View / Help menus and a persistent customizable toolbar; restore complete status metadata.
- Add appearance presets/custom accents with contrast adaptation, independent link colors, warm/cool surfaces and interface density.
- Preview appearance and reading changes live, then apply or cancel without changing document text.
- Fix stacked comparison controls, same-name tab identification, late IME edits and per-tab undo/redo isolation.
- Keep the frontend dependency-free at runtime beyond existing packages; add no fonts or image assets.

## 1.2.0

- Open linked desktop documents and directory READMEs, including parent paths and heading fragments.
- Keep browser folder links and images inside the viewer; open unavailable links in a secure new tab.
- Add Back/Forward navigation, document search, link destinations, modal focus handling and desktop Preview defaults.
- Add GitHub alerts, footnotes with repeated-reference backlinks, desktop recent files and safe disk-change reload.
- Fix dropped-folder discovery, document base isolation, Unicode search and recent-file cancellation.
- Reduce bundled language assets, consolidate Markdown themes and minify native frontend assets.
- Bound Linux dependency setup and cache the pinned WebDriver binary.

## 1.0.2

- Add desktop Linux `.deb` and portable `.tar.gz` packages with launchers and a menu entry.
- Support older WebView standard libraries with `at` and `hasOwn` compatibility shims.
- Add an offline Android Preview APK with native document opening, Save and HTML export.
- Await native writes and keep edits dirty when Android's document picker is cancelled.
- Gate publication on Linux installation/removal and Android emulator smoke checks.

## 1.0.1

- Preview now fills the available pane width and height on desktop and narrow screens.
- Remove the reading-width cap in Preview mode so content uses the full available width.
- Keep Source and Split layouts working; add real-browser geometry checks at four viewport sizes.

## 1.0.0

First packaged release, with a per-user Windows installer and a portable offline ZIP.

- Prevent stale task-list clicks from editing a different task while a source render is pending.
- Preserve unsaved edits typed during a save; serialize concurrent save requests.
- Keep a new document separate from a previous document's pending save.
- Preserve the original name and file handle after a failed Save As.
- Do not discard edits typed while saving from the unsaved-changes dialog.
- Export the latest source, with frozen task checkboxes and independent theme styles.
- Match the selected Markdown file to its own handle when multiple files are dropped.
- Correct Tab indentation on empty lines and multiline selection boundaries.
