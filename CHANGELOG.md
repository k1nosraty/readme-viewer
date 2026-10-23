# Changelog

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
