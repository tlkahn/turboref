# TurboRef

A high-performance Obsidian plugin for automatic cross-referencing of figures, tables, sections, equations, and code listings. Compatible with [pandoc-crossref](https://github.com/lierdakil/pandoc-crossref) syntax.

Built with a **Rust/WASM core** for fast, reliable parsing and a TypeScript UI layer for seamless Obsidian integration.

## Features

- **All pandoc-crossref types**: figures, tables, sections, equations, code listings
- **Live editing preview**: references render inline as you type, expanding when your cursor enters them
- **Reading mode rendering**: full cross-reference resolution in preview
- **Auto-completion**: type `[@` to get suggestions for all defined references
- **Batch references**: `[@fig:a;@fig:b;@fig:c]` renders as "Figs. 1-3" (consecutive range detection)
- **Sub-figures**: group images in a `<div>` block with letter-suffixed numbering (1a, 1b, ...)
- **Auto-labeling**: figures and tables get IDs automatically on paste/drop/creation
- **i18n**: English and Chinese defaults built-in
- **Frontmatter config**: override prefixes and titles per-document
- **Extensible**: trait-based parser architecture for adding custom reference types

## Reference Syntax

### Definitions

```markdown
![A cat](cat.png){#fig:cat}

: Data table {#tbl:data}

# Introduction {#sec:intro}

$$E = mc^2$${#eq:einstein}

$$
a^2 + b^2 = c^2
$$
{#eq:pythag}

$F = ma${#eq:newton}
```

````markdown
```python
print("hello")
```
{#lst:hello}
````

### Citations

```markdown
See [@fig:cat] for the image.
Refer to [@tbl:data] and [@eq:einstein].
As discussed in [@sec:intro].
See [@lst:hello] for the code.

Batch: [@fig:a;@fig:b;@fig:c]         → "Figs. 1-3"
Mixed: [@fig:cat;@tbl:data;@eq:einstein] → "Fig. 1, Table 1, Eq. 1"
```

### Sub-figures

```markdown
<div id="fig:animals">
![Cat](cat.png){#fig:cat}
![Dog](dog.png){#fig:dog}
Domestic animals
</div>
```

`[@fig:cat]` → "Fig. 1a", `[@fig:dog]` → "Fig. 1b", `[@fig:animals]` → "Fig. 1"

## Installation

### Manual

1. Download `main.js`, `manifest.json`, `styles.css`, and `turboref_wasm_bg.wasm` from the [latest release](https://github.com/mcardZH/turboref/releases)
2. Create `.obsidian/plugins/turboref/` in your vault
3. Copy all four files into that directory
4. Enable "TurboRef" in Settings → Community Plugins

### From Source

Requires: Rust toolchain, wasm-pack, Node.js

```bash
git clone https://github.com/mcardZH/turboref.git
cd turboref
npm install
./install.sh /path/to/your/vault
```

## Development

```bash
# Run Rust tests (98 unit tests)
cargo test -p turboref-core

# Build WASM
wasm-pack build crates/wasm --target web --release

# Build TypeScript (watch mode)
node esbuild.config.mjs

# Full production build + install
./install.sh
```

## Frontmatter Configuration

Override defaults per-document:

```yaml
---
figureTitle: "Figure"
tableTitle: "Table"
figPrefix: ["Fig.", "Figs."]
tblPrefix: ["Table", "Tables"]
eqPrefix: ["Eq.", "Eqs."]
lstPrefix: ["Listing", "Listings"]
secPrefix: ["Section", "Sections"]
---
```

## Architecture

TurboRef separates concerns into two layers:

- **Rust core** (`crates/core`): All parsing, numbering, reference resolution, and text rendering. Compiled to WebAssembly. 98 unit tests.
- **TypeScript shell** (`src/`): Obsidian plugin lifecycle, CodeMirror 6 live decorations, DOM post-processing, auto-completion, event listeners, settings UI.

The WASM boundary uses stateless JSON calls — the TypeScript side sends document content + config, gets back resolved references. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.

## Dependencies

### Rust
- `serde` + `serde_json` — JSON serialization across WASM boundary
- `regex` — pattern matching for all reference types
- `rand` — random tag generation for auto-IDs
- `wasm-bindgen` — WASM/JS interop (wasm crate only)

### TypeScript
- `obsidian` — Obsidian plugin API
- `@codemirror/*` — CodeMirror 6 editor extensions (provided by Obsidian)
- `esbuild` — TypeScript bundling

## License

MIT
