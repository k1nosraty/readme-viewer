# Changelog

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
