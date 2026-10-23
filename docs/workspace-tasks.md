# Document workspace

Branch: `feature/document-workspace`. Based on v1.2.0. Review branch only: no release, tag,
or updates to main/develop until the owner approves publication.

## Ordered implementation

- [x] W1 — Isolate document state, file access, navigation, selection and scroll per tab.
- [x] W2 — Tab strip, new/open/switch/close, dirty indicators, keyboard access and safe app close.
- [x] W3 — View independent documents alongside each other, with a resizable secondary pane.
- [x] W4 — Accessible link menu: current tab, new tab, browser; touch long-press equivalent.
- [x] W5 — Resume reading position, heading bookmarks and collapsible sections.
- [x] W6 — Hide completed tasks, reading width/line spacing and opt-in session restoration.
- [x] W7 — Refine the existing desktop tool UI, responsive behavior, English/Persian labels.
- [x] W8 — Regression tests, real-browser desktop/mobile checks, native asset build and size comparison.

## Constraints and verification

No new production dependencies, embedded fonts, remote services or heavy rendering engines.
Retain the original Markdown bytes outside explicit edits. Keep native file access validation.
Save, close, reload and navigation must never silently discard another tab's changes.
Background tabs keep document state; only visible documents should retain rendered content.
Persist session/draft content only when the user opts in, with an explicit clear action and storage
failure handling. A restored snapshot must not silently overwrite a file without renewed access.

UI direction: extend the existing restrained document tool. Use a legible tab strip, balanced
neutral surfaces, compact command groups, consistent SVG icons, clear active/dirty states, and
visible keyboard focus. Preserve full-width Preview, light/dark themes and Persian content.
A second document pane is distinct from Source/Split/Preview modes of the active document.

Each task is validated before starting the next dependent task. Actual minified frontend and
compressed-size changes will be recorded after implementation; installer deltas require matching
platform builds and cannot be inferred exactly from gzip alone.

## Implemented behavior

Open and system Open with create tabs, reusing the initial empty tab. A file already open by
native path is focused rather than duplicated. Plain links replace their originating tab with
discard protection; the link menu can instead open another tab or the browser. The second
reading view has independent document/fragment/image resolution and can be activated for editing.
On narrow screens, the two views stack and the Contents drawer starts closed.

Undo/redo belongs to each tab, coalesces consecutive typing, and is bounded to 100 snapshots /
4 MiB across undo and redo for that tab. Large snapshots may exceed the budget and are dropped
from history; the current document is never truncated. Background previews are not retained.

Reading settings, bookmarks, section folding and reading positions are local metadata. Sessions
are opt-in, limited to two million serialized characters, and restored without file handles as
unsaved copies. Clear saved session removes stored draft text without closing the current tabs.

Desktop local Browser actions create standalone HTML snapshots in the application cache; up to
eight are retained. The browser preview blocks scripts and does not change the source file.
Android supports browser actions for web links; local HTML browser previews require desktop.
Local browser file access remains limited to what the browser exposes.

Validation and size measurements are recorded below after W8. F5 (Markdown file tree) remains
explicitly out of scope. No production dependencies were added.

## Local validation before CI

- Final full JavaScript suite: 156 tests passed; the seven-test reading suite includes session
  reading metadata and revealing folded/filtered search results. CI runs the full suite again.
- Chromium: per-tab undo/redo and document replacement, two-pane layouts at 1440/760/390px,
  reading preferences/task filtering, and mobile HTML export with an open Contents drawer passed.
- Native asset preparation passed; native Rust preview-cache unit test runs in Linux CI.
- Frontend comparison against v1.2.0: +66,825 source bytes; +43,754 minified bytes; +12,201
  gzip bytes, measured per JS/CSS/HTML file. This is a frontend compression proxy, not an exact
  installer-size delta; native code and each package's compression can differ.

[Native branch CI](https://github.com/k1nosraty/readme-viewer/actions/workflows/native.yml?query=branch%3Afeature%2Fdocument-workspace)
builds and checks Linux, Windows and Android review artifacts. Its live result is authoritative
for native validation. Publication remains gated on the owner's approval; this branch's CI does
not create a GitHub release.

### UI/UX audit follow-up

- [x] Compact primary toolbar; document, appearance and session tools in an accessible More panel.
- [x] Separate reading preferences from session storage; collapse advanced base-URL settings.
- [x] Fix stacked comparison overflow; keep second-document controls visible and independently scrollable.
- [x] Distinct two-document icon and explicit main-pane action; visible resize handle.
- [x] Disambiguate identical tab names, expose full paths and keep the active tab in view.
- [x] Touch-sized mobile primary controls and tab close buttons; compact reading status bar.
- [x] Adaptive reading measure, full-width table documents, full/comfortable overrides and Persian system-font fallbacks.
- [x] Keyboard dismissal/focus restoration for settings, theme-aware controls and print cleanup.

Validation: 157 unit/DOM tests; Chromium smoke with comparison hit-testing; 20 combinations of
English/Persian, light/dark and 360/390/760/1024/1440px viewports. Narrow settings panels have
no horizontal overflow. Native asset preparation succeeds. No production dependencies or font
assets were added. Physical-device/native-shell visual QA remains outstanding. No release or
main/develop merge is authorized by this review work.
