# Design System — readme-viewer

Local, offline, single-document Markdown workbench that renders READMEs with GitHub-accurate
typography. RTL-first (Persian UI shell), usable with any keyboard/IME, no network access, no
build step. Opened directly from `file://`.

## 1. Product context

**What it is:** a two-pane editor + live preview for a single Markdown file, with a table of
contents, synchronized scrolling, direction controls and a status bar. It is a *tool*, not a
product page: density, clarity and keyboard efficiency beat decoration.

**Who it's for:** developers and technical writers who write documentation in Persian, Arabic,
English or any other script, and who need to know exactly how their README will look.

**Job to be done:** "I edit a README and I need to trust that what I see is what GitHub will show
— including mixed Persian/English text, code, tables and RTL layout."

**Key screens / architecture**

| Region | Purpose |
| --- | --- |
| Topbar (52px) | file identity (name + unsaved dot) + all actions: open/save, view mode, text direction, font size, theme, wrap, sync scroll, TOC, export, help |
| Sidebar (262px, optional) | live table of contents + relative-link base URL |
| Editor pane | monospace textarea with line-number gutter, drag-drop target |
| Preview pane | GitHub-styled rendered Markdown, 1012px measure, hover heading anchors |
| Status bar (26px) | file state, cursor position, word/char counts, render time, detected language |

State is encoded in attributes: `body[data-theme]`, `.layout[data-sidebar]`, `.panes[data-mode]`,
`--split`, `--rv-font`, `.editor[data-wrap]`.

**Hard UX constraints (any design must respect these)**

- Shell is `dir="rtl" lang="fa"`; preview content is `dir="auto"` per block. Never hardcode
  left/right — use logical properties (`inline-start/end`, `padding-inline`, `border-inline`).
- The editor must remain a real `<textarea>` so every IME works natively. No custom key handling
  that could break composition (`isComposing`, `keyCode 229`), except Tab-to-indent guarded by it.
- No webfonts, no CDN, no network calls: fonts must come from system stacks.
- The preview surface keeps `github-markdown-css` typography (GitHub look) unless the user
  explicitly asks for a different markdown look.
- Everything must fit without horizontal page scrolling; long toolbars may scroll internally.

## 2. Typography

**UI font (shell)** — system stack, Arabic/Persian families appended so RTL text never falls back
to a Latin-only face:

```
-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans",
"Vazirmatn", "IRANSans", Tahoma, "Noto Sans Arabic", "Noto Sans Naskh Arabic", Arial, sans-serif
```

**Mono font (editor, gutter, metadata, code)**:

```
ui-monospace, SFMono-Regular, "Cascadia Mono", "Cascadia Code", Consolas,
"DejaVu Sans Mono", "Noto Sans Mono", "Liberation Mono", Menlo, monospace,
"Noto Sans Arabic", "Noto Sans Naskh Arabic", Tahoma, "Segoe UI"
```

**Type scale** (fixed, unless a branch explicitly re-declares it):

| Role | Size / line-height |
| --- | --- |
| Shell base (`body`) | 14px |
| Toolbar buttons | 14px / 1.3, `padding: 5px 9px` |
| Editor + gutter | 13px / 1.6, `tab-size: 4` |
| Pane header | 12px muted |
| Pane header metadata | 11px mono |
| Status bar, sidebar labels | 12px muted |
| Preview body | `16px` (user-adjustable 12–26) / 1.5, `max-inline-size: 1012px` |
| Code inside preview | `85%` of surrounding size |
| Modal title | 17px |

## 3. Color

GitHub Primer derived, two themes, defined as CSS variables on `body[data-theme]`.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#ffffff` | `#0d1117` | editor, preview, pane headers |
| `--bg-subtle` | `#f6f8fa` | `#161b22` | topbar, status bar, sidebar, gutter |
| `--bg-inset` | `#eef1f4` | `#010409` | hover fills |
| `--border` | `#d1d9e0` | `#3d444d` | hairlines |
| `--border-strong` | `#b9c2cc` | `#545d68` | emphasis, resizer |
| `--fg` | `#1f2328` | `#e6edf3` | primary text |
| `--muted` | `#59636e` | `#9198a1` | secondary text, gutter, metadata |
| `--accent` | `#0969da` | `#4493f8` | active toggles, brand mark, TOC marker, focus ring |
| `--accent-fg` | `#ffffff` | `#0d1117` | text on accent |
| `--danger` | `#cf222e` | `#f85149` | error toast |

## 4. Spacing, shape, structure

| Token | Value |
| --- | --- |
| `--radius` | `6px` (modal `10px`, toast `999px` pill) |
| `--topbar-h` | `52px` |
| `--status-h` | `26px` |
| `--split` | `50%` (editor:preview ratio, resizer `7px`) |
| sidebar width | `262px` |
| editor padding | `14px 16px` |
| preview padding | `28px 32px 60vh` |
| `--shadow` | `0 8px 28px rgba(31,35,40,.18)` / `rgba(1,4,9,.7)` |

Breakpoints: `≤ 780px` → panes stack vertically (editor above preview, `1fr / 7px / 1fr`), the
resizer becomes a row resizer, and the sidebar becomes a fixed overlay drawer at the inline end.

## 5. Components

Toggles are stateful via `aria-pressed="true"` → solid `--accent` pill; default buttons are
transparent with a `--bg-inset` hover and a `--border` outline on hover. Icon-only affordances
are text glyphs (`A−`, `A+`, `؟`, `md`).

| Component | Notes |
| --- | --- |
| TopBar | brand mark (accent square, mono `md`) + file name (ellipsized, 26ch) + unsaved dot; toolbar groups divided by hairlines |
| ToolbarButtonGroup | horizontal cluster, `gap: 2px`, inline-end hairline divider |
| PaneHeader | title inline-start, mono metadata inline-end, hairline bottom |
| Sidebar | TOC rail: heading, scrollable outline with indent ladder h1→h6, active marker = 2px accent inline-start; base-URL input pinned bottom |
| Editor | monospace textarea, `dir="auto"`, optional gutter rail (min 46px) |
| Preview | 1012px measure, hover `#` anchors floated inline-start |
| StatusBar | 26px strip, facts separated by `·`, last item pushed inline-end |
| Modal | scrim `rgba(31,35,40,.5)`, `min(560px, 92vw)`, max 80vh, closes on button/backdrop/Escape |
| Toast | fixed bottom-center pill, red variant for errors |

Critical CSS rule to preserve: `[hidden] { display: none !important; }` — several components
(`display: grid`/`flex`) would otherwise ignore the `hidden` attribute.

## 6. Motion

Minimal and functional only. Toast enters with `.18s ease-out` fade+rise, guarded by
`prefers-reduced-motion: no-preference`. No parallax, no decorative transitions, no skeleton
shimmer. Scroll sync must stay instant (`scroll-behavior: auto`).

## 7. Sanctioned exploration axes

Directions may explore *layout, density, hierarchy and chrome treatment* within these declared
axes. Everything in §1–§6 above (fonts, RTL/logical properties, textarea editor, GitHub markdown
typography, token names, 6px-family radii, hairlines) is a hard constraint.

1. **Chrome density** — airy (more padding, 60–64px topbar) vs. compact (current 52px).
2. **Accent family** — one restrained accent used sparingly (current Primer blue `#0969da`), a
   neutral/ink-only chrome with no accent, or a single warm accent (amber/terracotta).
   Explicitly excluded: neon, purple/violet gradients, multi-hue "AI SaaS" palettes.
3. **Information architecture** — toolbar overflow into a single "⋯ more" popover, view modes as
   a segmented control with icons, TOC as an overlay drawer instead of a persistent rail, status
   facts promoted into the topbar or pane headers.
4. **Hierarchy cues** — stronger pane-header separation, inset/elevated surfaces, subtler
   borders, focus-visible rings everywhere.

## 8. Content & copy

UI language is Persian (RTL); keyboard hints and acronyms stay Latin (`Ctrl+S`, `LTR`, `HTML`,
`A+`). Numbers use Persian digits in prose labels (`سطر ۱، ستون ۱`) but plain digits in code-like
metadata. Tone: short labels, tooltips for anything non-obvious, `Ctrl+…` hints in every
file/view action's tooltip. Never send data to the network — say so plainly in the help dialog.