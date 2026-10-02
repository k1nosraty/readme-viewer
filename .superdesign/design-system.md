# Design System — readme-viewer

Local, offline, single-document Markdown workbench that renders READMEs with GitHub-accurate
typography. **English, left-to-right shell; content-adaptive document direction** (Persian, Arabic
and Hebrew render right-to-left inside an otherwise LTR interface). Usable with any keyboard/IME,
no network access, no build step. Opened directly from `file://`, or served by any static server.

## 1. Product context

**What it is:** a two-pane editor + live preview for a single Markdown file, with a table of
contents, synchronized scrolling, direction controls, an optional *interactive preview* for task
lists, and a status bar. It is a *tool*, not a product page: density, clarity and keyboard
efficiency beat decoration.

**Who it's for:** developers and technical writers who write documentation in English, Persian,
Arabic or any other script, and who need to know exactly how their README will look.

**Job to be done:** "I read or edit a README and I need to trust that what I see is what GitHub
will show — including mixed Persian/English text, code, tables and RTL layout."

**Job to be done (interactive):** "I keep a checklist in my README and I want to tick items off
while reading, without switching to the source pane — and without the app rewriting my formatting."

**Architecture**

| Region | Purpose |
| --- | --- |
| Topbar (52px min) | file identity (name + unsaved state) and all actions: open/save/save-as/reload, view mode, edit-in-preview, direction, text size, theme, wrap, sync, TOC, export, help |
| Sidebar (268px, optional) | live table of contents with filter + relative-link base URL |
| Editor pane | monospace textarea with line-number gutter, drag-drop target |
| Preview pane | GitHub-styled rendered Markdown, 860px measure, hover heading anchors, optional interactive task checkboxes |
| Status bar (28px) | file state, cursor position, word/char counts, task progress, encoding/EOL, content language, render time |

State is encoded in attributes, never in parallel JS-only state:
`html[data-theme]`, `html[dir]`, `.layout[data-sidebar]`, `.panes[data-mode]`,
`#preview[data-edit]`, `.preview[data-empty]`, `#editor[data-wrap]`, `--split`, `--rv-font`.

**Hard UX constraints (any design must respect these)**

- The shell is LTR/English (`<html lang="en" dir="ltr">`). Only rendered Markdown blocks get a
  `dir` of their own, decided from their text. Never hardcode left/right in component CSS — use
  logical properties (`inline-start/end`, `padding-inline`, `border-inline`).
- The editor must remain a real `<textarea>` so every IME works natively. No custom key handling
  that could break composition (`isComposing`, `keyCode 229`), except Tab-to-indent guarded by it.
- No webfonts, no CDN, no network calls: fonts come from system stacks, libraries from `vendor/`.
- The preview keeps `github-markdown-css` typography (the GitHub look).
- Everything must fit without horizontal page scrolling; wide tables scroll inside their wrapper.
- The Markdown source is the single source of truth. Interactive edits rewrite the smallest
  possible span (three characters for a task checkbox) and nothing else.

## 2. Typography

**UI font (shell)** — system stack, Arabic/Persian families appended so an RTL interface language
never falls back to a Latin-only face:

```
-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans",
"Vazirmatn", "IRANSans", Tahoma, "Noto Sans Arabic", Arial, sans-serif
```

**Mono font (editor, gutter, metadata, code)**:

```
ui-monospace, SFMono-Regular, "Cascadia Mono", "Cascadia Code", Consolas,
"DejaVu Sans Mono", "Noto Sans Mono", "Liberation Mono", Menlo, monospace,
"Noto Sans Arabic", Tahoma
```

**Type scale**

| Role | Size / line-height |
| --- | --- |
| Shell base (`body`) | 14px / 1.45 |
| Toolbar buttons | 13px / 1, control height 30px |
| Segmented labels | 12px |
| Editor + gutter | 13px / 1.6, `tab-size: 4` (must match exactly or line numbers drift) |
| Pane header | 11px uppercase, letter-spacing .04em, muted |
| Preview body | `--rv-font` px (user adjustable 12–26) / 1.6, `max-inline-size: 860px` |
| Code inside preview | 85% of the surrounding size |
| Sidebar links | 12.5px |
| Modal title | 16px |
| Status bar | 11px |

**Icons:** one SVG set (`src/icons.js`), 24×24 grid, `stroke-width: 1.75`, round caps and joins,
`currentColor`. 16px in the toolbar, 12–14px inline. No icon fonts, no emoji in chrome. Every
icon-only control carries `title` + `aria-label`.

## 3. Color

GitHub Primer derived, two themes plus "follow the system", defined as CSS variables on
`html[data-theme]`.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#ffffff` | `#0d1117` | editor, preview |
| `--bg-subtle` | `#f6f8fa` | `#161b22` | topbar, status bar, sidebar, pane headers |
| `--bg-inset` | `#eaeef2` | `#010409` | pressed fills |
| `--bg-hover` / `--bg-active` | 12% / 20% grey | 12% / 20% grey | hover and press states |
| `--border` / `--border-muted` | `#d1d9e0` / `#dfe5ea` | `#3d444d` / `#2f353d` | hairlines |
| `--fg` / `--fg-muted` / `--fg-subtle` | `#1f2328` / `#59636e` / `#6e7781` | `#e6edf3` / `#9198a1` / `#7d8590` | text hierarchy |
| `--accent` / `--accent-subtle` | `#0969da` / `#ddf4ff` | `#4493f8` / `#12283f` | active toggles, brand mark, focus ring, edit mode |
| `--success` / `--warn` / `--danger` (+ `-subtle`) | Primer green/amber/red | same, dark variants | toasts, unsaved state, destructive actions |
| `--code-bg` / `--code-bar` | `#f6f8fa` / `#eef1f4` | `#161b22` / `#0d1117` | fenced code blocks |

Semantic colors are used only for state: accent = active/interactive, warn = unsaved or degraded,
danger = destructive, success = confirmation. The document itself is never tinted.

## 4. Spacing, shape, structure

| Token | Value |
| --- | --- |
| `--s1…--s6` | 4 / 8 / 12 / 16 / 24 / 32 px (all spacing comes from this ladder) |
| `--r-sm` / `--r-md` / `--r-lg` / `--r-pill` | 6 / 8 / 12 px / 999px |
| `--control-h` | 30px |
| `--topbar-h` | 52px (min-height; the toolbar wraps on narrow windows) |
| `--status-h` | 28px |
| `--split` | 50% (persisted; clamped 15–85%, resizer 6px) |
| sidebar width | 268px |
| editor padding | 16px |
| preview padding | 32px 32px 55vh (the long tail lets the last line scroll to the top) |
| `--shadow-sm/md/lg` | hairline / popover / modal elevation |
| `--dur` / `--ease` | 120ms, `cubic-bezier(.2,0,0,1)` |

Breakpoints: `≤ 1080px` toolbar buttons drop their labels (icons only); `≤ 900px` panes stack
vertically (per view mode) and the sidebar becomes a fixed overlay drawer at the inline end;
`≤ 640px` the brand text and secondary status facts hide.

## 5. Components

Toggles are stateful via `aria-pressed="true"`. Segmented controls use a filled
`--accent-subtle`/`--accent` treatment; the destructive-vs-primary distinction lives in the modal
footer only.

| Component | Notes |
| --- | --- |
| TopBar | SVG brand mark on an accent square, file name + unsaved/saved line, toolbar in bordered pill clusters (`--bg` surface, `--border-muted` hairline, `--shadow-sm`) |
| ToolbarButton | 30px, icon + label, `--bg-hover` hover, `--bg-active` press, `opacity .42` when disabled |
| EditInPreviewToggle | accent-filled when on; the preview pane echoes the state with a pill badge (`on` = accent, `warn` = amber when the source map is not trustworthy) |
| PaneHeader | 11px uppercase title inline-start, mono metadata inline-end, optional state pill |
| Sidebar | filter field with search glyph and clear button, indent ladder h1→h6, active item = 2px accent inline-start + accent-subtle fill, base-URL input pinned bottom |
| Editor | monospace textarea, `dir="auto"`, gutter rail (hidden when wrapping or above 20 000 lines) |
| Preview | 860px measure centred, heading anchors as `#` SVG icons floated inline-start, code blocks in a bordered card with a language + copy bar, wide tables in a scroll wrapper |
| TaskList | GitHub markup (`contains-task-list`, `task-list-item`, `task-list-item-checkbox`); interactive only while `#preview[data-edit="1"]`, then the checkbox gets a pointer, an accent ring on hover and a row tint via `:has()` |
| EmptyState | centred in the visible pane: glyph, title, body, primary/secondary actions, privacy hint |
| StatusBar | 28px strip; empty facts and their dividers collapse (`:empty` + `:has()`) |
| Modal | `--scrim` overlay, `min(580px, 94vw)` (confirm: 430px), closes on button/backdrop/Escape, focus returns to the trigger |
| Toast | bottom inline-end stack, icon per kind (success/info/warning/error), auto-dismiss, click to dismiss |

Critical CSS rule to preserve: `[hidden] { display: none !important; }` — several components
(`display: grid`/`flex`) would otherwise ignore the `hidden` attribute.

## 6. Motion

Minimal and functional only: 120ms color/opacity transitions on interactive controls, a 120ms
fade+rise for toasts and modals, all disabled under `prefers-reduced-motion`. No parallax, no
decorative transitions, no skeleton shimmer. Scroll sync stays instant (`scroll-behavior: auto`).

## 7. Sanctioned exploration axes

Directions may explore *layout, density, hierarchy and chrome treatment* within these axes.
Everything in §1–§6 above (fonts, logical properties, textarea editor, GitHub markdown typography,
token names, hairlines, the SVG icon language) is a hard constraint.

1. **Chrome density** — airy (more padding, taller topbar) vs. compact.
2. **Accent family** — one restrained accent used sparingly (Primer blue), a neutral/ink-only
   chrome, or a single warm accent. Explicitly excluded: neon, purple gradients, multi-hue palettes.
3. **Information architecture** — toolbar overflow into a "more" popover, view modes as a
   segmented control (current), TOC as an overlay drawer instead of a persistent rail, status
   facts promoted into pane headers.
4. **Hierarchy cues** — stronger pane-header separation, inset surfaces, subtler borders,
   focus-visible rings everywhere.

## 8. Content & copy

The interface language is **English**, and every string lives in `src/i18n.js` so another language
is a data change; Persian (`fa`) ships as a complete second locale and flips the shell to
`dir="rtl"` when selected. Keyboard hints and acronyms stay Latin (`Ctrl+S`, `LTR`, `HTML`).
Numbers are plain digits in every locale — never localise digits inside monospace metadata.
Tone: short labels, tooltips for anything non-obvious, `Ctrl+…` hints in every file/view action's
tooltip, errors that name the file and the reason. Never send data to the network — say so plainly
in the empty state and the help dialog.
