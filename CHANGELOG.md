# Changelog

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
