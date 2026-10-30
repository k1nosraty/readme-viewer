# Full Mermaid + ELK (offline)

Pinned packages: `mermaid@11.17.2`, `@mermaid-js/layout-elk@0.2.2`, `elkjs@0.9.3`.
The single IIFE includes all diagram renderers and the optional ELK loader. It supports
`file://` browser use and the Tauri shell without dynamic module fetches or a CDN.
Mermaid 11.x is retained for older WebViews; Mermaid 12 targets newer browser syntax.

The Mermaid/adapter MIT licenses and elkjs EPL-2.0 license are adjacent to this file.
Dependency license notices are retained at the end of the bundle. The unmodified elkjs
source is available at https://www.npmjs.com/package/elkjs/v/0.9.3 and
https://github.com/kieler/elkjs/tree/0.9.3.

## Rebuild

Install these build-only packages into a temporary directory (not shipped with the app):

```sh
npm install --prefix /tmp/readme-full-build --ignore-scripts --no-audit --no-fund mermaid@11.17.2 @mermaid-js/layout-elk@0.2.2 esbuild@0.28.2
node scripts/build-mermaid.js /tmp/readme-full-build/node_modules
```

The app itself gains no runtime npm dependencies. SHA-256 of the checked-in bundle:

`18a197fdb8930360fe7d967c967d22f673150d38d1723c4e0d94046a4cd16555`

The engine loads only on the first Mermaid block. A flowchart's Layout selector offers
Dagre and ELK; mindmaps and architecture diagrams work offline. Embedded document
configuration, external diagram images, HTML labels and interactive links remain disabled.
Math in labels stays literal text in this safe SVG-image mode. The generated SVG is
sanitised and displayed as an image so diagram CSS cannot style the application.
