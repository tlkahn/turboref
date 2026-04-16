# TurboRef

A high-performance Obsidian plugin for automatic cross-referencing of figures, tables, sections, equations, and code listings. Compatible with [pandoc-crossref](https://github.com/lierdakil/pandoc-crossref) syntax.

Built with a **Rust/WASM core** for fast, reliable parsing and a TypeScript UI layer for seamless Obsidian integration.

## Features

- **All pandoc-crossref types**: figures, tables, sections, equations, code listings
- **Citeproc bibliography support**: auto-complete and render bibliographic citations from `.bib` files — type `[@bib:` to search entries, rendered as "Author Year" inline. Supports `[-@key]` to suppress the author and show only the year, and locator suffixes like `[@key, ch. 11]` or `[@key, pp. 45-50]`
- **Live editing preview**: both citations (`[@fig:cat]` → "Fig. 1") and definition tags (`{#fig:cat}` → "#Fig. 1") render inline, expanding when your cursor enters them
- **Click-to-navigate**: click a crossref citation to scroll to its definition; click a bib citation to open the `.bib` file in your default editor
- **Reading mode rendering**: full cross-reference and citeproc resolution in preview
- **Auto-completion**: type `[@` to get suggestions for all defined references and bibliography entries
- **Batch references**: `[@fig:a;@fig:b;@fig:c]` renders as "Figs. 1-3" (consecutive range detection)
- **Sub-figures**: group consecutive images with a caption line for letter-suffixed numbering (1a, 1b, ...)
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

Diagram code blocks (mermaid, graphviz/dot, d2, plantuml, excalidraw, tikz) can also be tagged as figures:

````markdown
```mermaid
graph LR
    A --> B
```
{#fig:diagram}
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

Tags can also be placed on the next line (no blank line between):

```markdown
![A sunset](sunset.png)
{#fig:sunset}
```

### Sub-figures

Group consecutive images with a `: Caption {#fig:id}` line:

```markdown
![Cat](cat.png){#fig:cat}
![Dog](dog.png){#fig:dog}
: Domestic animals {#fig:animals}
```

`[@fig:cat]` → "Fig. 1a", `[@fig:dog]` → "Fig. 1b", `[@fig:animals]` → "Fig. 1"

A blank line between images breaks the group. The `<div id="fig:...">` HTML syntax is also supported for pandoc export compatibility.

### Bibliography Citations (Citeproc)

TurboRef supports [pandoc-citeproc](https://pandoc.org/chunkedhtml-demo/13-citations.html) bibliographic citations from `.bib` files.

**Setup**: add a `bibliography` field to your document's frontmatter pointing to a `.bib` file (resolved relative to the note's directory):

```yaml
---
bibliography: refs.bib
---
```

Multiple files are supported:

```yaml
---
bibliography:
  - primary.bib
  - secondary.bib
---
```

**Auto-completion**: type `[@`, select `bib`, then type a partial cite key. Bib entries are visually distinguished by an accent-colored left border. Selecting an entry inserts the bare key — producing valid citeproc syntax:

```markdown
[@sanderson2009]                    → "Sanderson 2009"
[@sanderson2009; @flood1996]        → "Sanderson 2009; Flood 1996"
[-@sanderson2009]                   → "2009"  (author suppressed)
[@flood1996; -@sanderson2009]       → "Flood 1996; 2009"
[@newman2018, ch. 11]              → "Newman 2018, ch. 11"  (locator)
[@newman2018, pp. 45-50]           → "Newman 2018, pp. 45-50"
[@smith2020, ch. 3; @jones2021]    → "Smith 2020, ch. 3; Jones 2021"
[-@bush1945, ch. 5]                → "1945, ch. 5"  (suppressed + locator)
```

**Rendered form**: citations display as "Author Year" when the cursor is outside:
- Single author: "Sanderson 2009"
- Two authors: "Sanderson & Jordan 2009"
- Three+: "Sanderson et al. 2009"
- Same author+year disambiguation: "Sanderson 2009a", "Sanderson 2009b"
- Author-suppressed (`[-@key]`): "2009" (year only, or "n.d." if no year)

**Click navigation**: clicking a rendered bib citation opens the `.bib` file in your system's default text editor, with a notification showing the entry's line number.

**Caching**: parsed `.bib` entries are cached in memory by default. Optionally enable Redis caching in settings for persistence across restarts.

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
# Run all tests (Rust + TypeScript)
npm test

# Run Rust tests only (166 unit tests)
cargo test -p turboref-core

# Run TypeScript tests only (53 unit tests — bib parser, renderer, resolver)
npx vitest run

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
bibliography: refs.bib          # or an array: [a.bib, b.bib]
---
```

## Architecture

TurboRef separates concerns into two layers:

- **Rust core** (`crates/core`): All crossref parsing, numbering, reference resolution, and text rendering. Compiled to WebAssembly. 166 unit tests.
- **TypeScript shell** (`src/`): Obsidian plugin lifecycle, CodeMirror 6 live decorations, DOM post-processing, auto-completion, event listeners, settings UI.
- **Bib pipeline** (`src/bib/`): TypeScript-only citeproc support — BibTeX parsing, "Author Year" rendering with disambiguation, `[-@key]` author-suppression, locator suffixes (`[@key, ch. 11]`), frontmatter path resolution, in-memory/Redis caching. 53 unit tests.

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
- `ioredis` — Redis client for optional bib entry caching
- `esbuild` — TypeScript bundling
- `vitest` — TypeScript unit testing (dev)

## License

MIT
