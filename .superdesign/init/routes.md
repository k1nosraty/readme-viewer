# Routes — readme-viewer

No router. The app is a single document opened directly from the filesystem (`file://`),
deliberately build-step-free and offline. Opening any README is an in-app file operation
(File System Access API or `<input type=file>`), never a navigation.

## `/` — the single view

- URL: `index.html` (also served as `/index.html` by any static server)
- Component file: `index.html` (whole app)
- Layout used: AppShell (topbar + workspace + statusbar)
- Renders: the editor/preview split workbench with TOC sidebar, toolbar, help modal, toast.

State that behaves like "routes" is encoded in attributes, not URLs:

| Concern | Attribute / variable | Values |
| --- | --- | --- |
| View mode | `.panes[data-mode]` (`#panes`) | `write` \| `split` \| `preview` |
| TOC sidebar | `.layout[data-sidebar]` (`#layout`) | `on` \| `off` (plus `hidden` on `#sidebar`) |
| Theme | `body[data-theme]` | `light` \| `dark` (plus `auto` preference in `state.theme`) |
| Editor ratio | `--split` on `:root` | CSS percentage, default `50%` |
| Font size | `--rv-font` on `:root` | number 12–26, default `16` |
| Wrap | `.editor[data-wrap]` + `.editor-wrap[data-wrap]` | `1` / unset |
| Sync scroll | in-memory `state.sync` | `true` \| `false` |

Persistence: view-mode, sidebar, theme, font size, wrap, sync and base URL are mirrored to
`localStorage` (all access wrapped in try/catch because `file://` can throw). The open file name,
handle and dirty flag are session-only.

## Keyboard command map (document-level, `app.js:900-920`)

| Keys | Action |
| --- | --- |
| `Ctrl/Cmd+O` | Open file |
| `Ctrl/Cmd+S` | Save |
| `Ctrl/Cmd+Shift+S` | Save as |
| `Ctrl/Cmd+1 / 2 / 3` | Write / split / preview mode |
| `Escape` | Close help modal (when open), else blur editor |
| `Tab` / `Shift+Tab` | Indent / outdent — suppressed while an IME composition is active |