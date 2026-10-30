# Mermaid Tiny (offline)

Pinned upstream package: `@mermaid-js/tiny@11.17.2` (MIT).

- Source: https://registry.npmjs.org/@mermaid-js/tiny/-/tiny-11.17.2.tgz
- File: `package/dist/mermaid.tiny.js`, copied without modifications.
- SHA-256: `7a644017d37f93c8359790884e6b67fb1f747c78eb20475952404bd87190a3f8`
- License: adjacent `LICENSE`; dependency license notices are retained in the bundle.

The 11.x release is pinned for older desktop/mobile WebViews; Mermaid 12 targets ES2024.
The bundle is loaded only when a Mermaid code block is rendered. No CDN, new fonts,
CLI renderer, Chromium runtime, or extra npm runtime dependencies are shipped.

Tiny excludes mindmap, architecture, KaTeX math, ELK and internal diagram lazy loading.
The app lazy-loads the entire local bundle, uses strict security and text-only labels,
and disables embedded configuration directives/frontmatter. The SVG is sanitised and
shown in an image to isolate diagram CSS from the application. The source is retained
when rendering fails or a diagram type is unsupported.
