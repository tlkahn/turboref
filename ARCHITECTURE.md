# TurboRef Architecture

A pandoc-crossref-compatible Obsidian plugin with a Rust/WASM core and TypeScript UI layer.

## Design Principles

- **Rust core, TS shell**: All parsing, numbering, resolution, and rendering logic lives in Rust. TypeScript handles only Obsidian API, DOM, CodeMirror, and user interaction.
- **Stateless WASM boundary**: Each WASM call takes full document content + config JSON, returns results as JSON. TypeScript caches results per document version.
- **Single-pass scanning**: One forward pass through all lines with shared context (code block / math block awareness) dispatching to per-type parsers.
- **Trait-based extensibility**: New reference types (thm, def, lem, ...) implement the `DefinitionParser` trait and register with the scanner.
- **TDD in Rust**: All core logic is tested with `cargo test`. The `core` crate has zero WASM dependencies.

## Reference Types

| Type | Prefix | Definition Syntax | Citation | Renders As |
|------|--------|-------------------|----------|------------|
| Figure | `fig` | `![desc](img.png){#fig:id}` | `[@fig:id]` | "Figure 1" |
| Table | `tbl` | `: Caption {#tbl:id}` | `[@tbl:id]` | "Table 1" |
| Section | `sec` | `# Title {#sec:id}` | `[@sec:id]` | "Section 1.2.3" |
| Equation | `eq` | `$$...$${#eq:id}` or `$$\n...\n$$\n{#eq:id}` | `[@eq:id]` | "Eq. 1" |
| Listing | `lst` | `` ```\n...\n```\n{#lst:id} `` | `[@lst:id]` | "Listing 1" |

### Sub-figures

```markdown
<div id="fig:main">
![Cat](cat.png){#fig:cat}
![Dog](dog.png){#fig:dog}
Main caption
</div>
```
`[@fig:cat]` → "Figure 1a", `[@fig:main]` → "Figure 1"

### Equation Tag Styles

**Same-line** (display): `$$E = mc^2$${#eq:einstein}`
**Same-line** (inline): `$E = mc^2${#eq:einstein}`
**Next-line** (display block):
```
$$
E = mc^2
$$
{#eq:einstein}
```
**Next-line** (inline): Tag on the line immediately after `$...$` (no blank line).

### Listing Tag Style

**Next-line only** — tag immediately after the closing fence:
````
```python
print("hello")
```
{#lst:hello}
````

### Citations

- Single: `[@fig:id]`
- Batch: `[@fig:a;@fig:b;@fig:c]` → "Figures 1-3" (consecutive) or "Figures 1, 3, 5" (non-consecutive)
- Mixed: `[@fig:a;@tbl:b]` → "Figure 1, Table 2"
- Delimiters: `;` or `,`

---

## Project Structure

```
turboref/
├── Cargo.toml                      # Rust workspace
├── package.json                    # Node scripts + devDeps
├── tsconfig.json
├── esbuild.config.mjs
├── manifest.json                   # Obsidian plugin manifest
├── styles.css
│
├── crates/
│   ├── core/                       # Pure Rust library (TDD target)
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs              # Public API: Document, parse, resolve
│   │       ├── types.rs            # RefType, RefNumber, Definition, Citation
│   │       ├── config.rs           # DocumentConfig, defaults, frontmatter merge
│   │       ├── i18n.rs             # Locale enum, translation tables
│   │       ├── parser/
│   │       │   ├── mod.rs          # DefinitionParser trait + ParserRegistry
│   │       │   ├── scan.rs         # ScanContext, single-pass scanner
│   │       │   ├── figure.rs       # Figures + sub-figures
│   │       │   ├── table.rs        # Table captions
│   │       │   ├── section.rs      # Headings, hierarchical numbering
│   │       │   ├── equation.rs     # Display/inline math, same-line + next-line
│   │       │   └── listing.rs      # Fenced code blocks
│   │       ├── citation.rs         # Parse [@type:id;@type:id2] syntax
│   │       ├── resolver.rs         # ReferenceMap: id → Definition lookup
│   │       ├── renderer.rs         # Citation → rendered text (batch, range, prefix)
│   │       ├── template.rs         # {tag:n}, {filename}, {index}, {ext}
│   │       └── document.rs         # Orchestrator: parse → resolve → render
│   │
│   └── wasm/                       # Thin wasm-bindgen wrapper
│       ├── Cargo.toml
│       └── src/
│           └── lib.rs              # #[wasm_bindgen] exports, JSON in/out
│
├── src/                            # TypeScript source
│   ├── main.ts                     # Plugin entry + lifecycle
│   ├── bridge.ts                   # WASM loader + typed TS wrapper
│   ├── config.ts                   # PluginSettings, frontmatter merge → JSON
│   ├── settings.ts                 # Obsidian SettingTab UI
│   ├── i18n.ts                     # UI-only strings (settings labels, etc.)
│   ├── renderer/
│   │   ├── reading-mode.ts         # MarkdownPostProcessor
│   │   ├── live-mode.ts            # CodeMirror 6 decorations
│   │   └── widgets.ts              # CrossrefWidget, etc.
│   ├── suggest.ts                  # EditorSuggest for [@... completion
│   └── listeners/
│       ├── image.ts                # Image drop/paste → auto-label
│       └── table.ts                # Table detection → auto-caption
│
├── .github/workflows/
│   └── release.yml                 # CI: Rust toolchain + wasm-pack + esbuild
└── scripts/
    ├── build.sh                    # Full pipeline
    └── release.js                  # Version bump + tag
```

---

## Rust Core Architecture

### Key Types (`types.rs`)

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum RefType {
    Fig, Tbl, Sec, Eq, Lst,
    Custom(String),  // extensibility: user-defined types like "thm", "def"
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum RefNumber {
    Simple(u32),                // "3"
    SubNumbered(u32, char),     // "3a"
    Hierarchical(Vec<u32>),     // "1.2.3"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Definition {
    pub ref_type: RefType,
    pub id: String,
    pub number: RefNumber,
    pub caption: Option<String>,
    pub line: usize,
    pub char_offset: usize,     // UTF-16 code units for CodeMirror
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Citation {
    pub refs: Vec<CitationRef>,
    pub char_start: usize,
    pub char_end: usize,
    pub original: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CitationRef {
    pub ref_type: RefType,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedCitation {
    pub char_start: usize,
    pub char_end: usize,
    pub rendered_text: String,
    pub is_valid: bool,
    pub original: String,
}
```

### Parser Trait (`parser/mod.rs`)

```rust
pub trait DefinitionParser: Send + Sync {
    fn ref_type(&self) -> RefType;
    fn prefix_str(&self) -> &str;

    fn on_line(
        &self,
        line: &str,
        line_idx: usize,
        char_offset: usize,
        ctx: &ScanContext,
        counters: &mut Counters,
        config: &DocumentConfig,
    ) -> Vec<Definition>;
}
```

A `ParserRegistry` stores `Vec<Box<dyn DefinitionParser>>`. The built-in 5 types are always registered. Custom types can be added via `registry.register(parser)`.

### Single-Pass Scanner (`parser/scan.rs`)

`ScanContext` tracks shared state across all parsers:

```rust
pub struct ScanContext {
    pub in_code_block: bool,
    pub code_fence: String,         // "```" or "````" etc.
    pub in_math_block: bool,
    pub in_html_div: Option<String>,// sub-figure <div id="fig:...">
    pub prev_line_closed_math: bool,
    pub prev_line_closed_code: bool,
}
```

The scanner iterates lines once, updates `ScanContext`, then calls each parser's `on_line()`. Parsers check context flags to skip irrelevant states (e.g., equation parser skips when `in_code_block`).

### Equation Parser State Machine

```
None ──[opening $$]──→ InDisplayMath ──[closing $$]──→ JustClosedDisplay
                                                            │
                                             [next line {#eq:id}] → emit Definition
                                             [next line other]    → None

None ──[same-line $$...$${#eq:id}]──→ emit Definition
None ──[same-line $...$\n then {#eq:id}]──→ emit Definition
```

### Listing Parser State Machine

```
None ──[opening ```]──→ InFencedCode ──[closing ```]──→ JustClosed
                                                           │
                                            [next line {#lst:id}] → emit Definition
                                            [next line other]     → None
```

### Renderer Logic (`renderer.rs`)

1. Group `CitationRef`s by `RefType`
2. Per group: resolve each ref → `RefNumber`, sort numerically
3. Detect consecutive ranges (1,2,3 → "1-3")
4. Select prefix from config array: `prefix[min(count-1, len-1)]` (singular/plural)
5. Format: `"{prefix} {numbers}"` per group, join with ", "

### Config (`config.rs`)

```rust
pub struct DocumentConfig {
    pub locale: Locale,             // En, Zh
    pub figure_title: String,       // caption prefix: "Figure" / "图"
    pub table_title: String,
    pub listing_title: String,
    pub equation_title: String,
    pub fig_prefix: Vec<String>,    // citation prefix: ["Fig.", "Figs."]
    pub tbl_prefix: Vec<String>,
    pub eq_prefix: Vec<String>,
    pub lst_prefix: Vec<String>,
    pub sec_prefix: Vec<String>,
    pub link_references: bool,
    pub name_in_link: bool,
    pub subfig_grid: bool,
}
```

Constructed on the TS side by merging: plugin settings → frontmatter overrides → serialized as JSON for WASM.

---

## WASM Boundary

### Exported Functions

```rust
#[wasm_bindgen]
pub fn parse_document(content: &str, config_json: &str) -> String;
// → { "definitions": [...], "citations": [...] }

#[wasm_bindgen]
pub fn resolve_citations(content: &str, config_json: &str) -> String;
// → [{ char_start, char_end, rendered_text, is_valid, original }]

#[wasm_bindgen]
pub fn get_definitions(content: &str, config_json: &str) -> String;
// → [{ ref_type, id, number, caption, line, char_offset }]

#[wasm_bindgen]
pub fn expand_template(template: &str, context_json: &str) -> String;
// → expanded ID string
```

All calls are stateless. TS-side caching prevents redundant re-parses.

### Offset Convention

All character offsets are **UTF-16 code units**, matching CodeMirror 6's internal document model. The Rust scanner counts UTF-16 units as it iterates, so offsets can be used directly in `Decoration.replace(start, end, ...)`.

---

## TypeScript Layer

### Bridge (`bridge.ts`)

Loads `.wasm` from plugin directory on `onload()`. Provides typed wrappers over JSON results. Caches parse results keyed by `(filePath, documentVersion)`.

### Reading Mode (`renderer/reading-mode.ts`)

Obsidian `registerMarkdownPostProcessor`:
1. `bridge.resolveCitations(content, configJson)` → `ResolvedCitation[]`
2. DOM TreeWalker replaces `[@...]` text nodes with styled `<span>` elements
3. Hides `{#type:id}` markers from rendered text
4. Adds caption prefixes ("Figure 1: ...") to images and tables

### Live Mode (`renderer/live-mode.ts`)

CodeMirror 6 `EditorView.decorations.compute(["doc", "selection"])`:
1. `bridge.resolveCitations(content, configJson)` → `ResolvedCitation[]`
2. Skip citations whose range overlaps cursor position (±1 char buffer)
3. `Decoration.replace` with `CrossrefWidget` for each citation
4. Invalid citations styled with strikethrough + error color

**Click-to-edit on widgets**: `Decoration.replace` widgets swallow mouse events — CM6 does not place the cursor inside a replaced range on click (arrow keys work because they traverse positions sequentially). The fix is to handle `mousedown` directly on the widget DOM element (`widgets.ts:toDOM()`), calling `preventDefault()` + `stopPropagation()` to block CM6's default handling, then using `setTimeout(0)` to dispatch a `view.dispatch({ selection: { anchor: charStart } })` after CM6's event cycle settles. The `EditorView` is available via the `toDOM(view)` parameter. `EditorView.domEventHandlers` does **not** work for this because the replace widget intercepts the event before it reaches the handler.

### Suggest (`suggest.ts`)

Obsidian `EditorSuggest`, triggered by `[@`:
1. `bridge.getDefinitions(content, configJson)` → completion candidates
2. TS handles trigger detection, `;` separator for batch refs, type filtering
3. On select: inserts `type:id` at cursor

### Listeners (`listeners/`)

- **image.ts**: Intercepts drop/paste → calls `bridge.expandTemplate()` for `{#fig:id}` generation
- **table.ts**: Detects table creation → inserts `: Caption {#tbl:id}` via `bridge.expandTemplate()`

---

## Build Pipeline

```bash
# package.json scripts
"build:wasm":  "wasm-pack build crates/wasm --target web --release"
"build:ts":    "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production"
"build":       "npm run build:wasm && npm run build:ts"
"dev:wasm":    "cargo watch -w crates -s 'npm run build:wasm'"
"dev:ts":      "node esbuild.config.mjs"
"dev":         "concurrently 'npm run dev:wasm' 'npm run dev:ts'"
"test":        "cargo test -p turboref-core"
```

**Output**: `main.js` + `manifest.json` + `styles.css` + `turboref_wasm_bg.wasm`

**WASM shipping**: Separate `.wasm` file in the Obsidian plugin directory. Not base64-embedded — keeps `main.js` lean.

**WASM target**: Must use `--target web` (not `bundler`). The `web` target generates `initSync({ module: wasmBinary })` which accepts a `BufferSource` directly — the plugin reads the `.wasm` binary from disk via Obsidian's `FileSystemAdapter.readBinary()` and passes it to `initSync`. The `bundler` target generates different glue code that doesn't expose the right initialization API.

**wasm-opt**: The wasm-pack bundled `wasm-opt` may not support all platforms (e.g., Apple Silicon). Set `wasm-opt = false` in `[package.metadata.wasm-pack.profile.release]` and run the system `wasm-opt` (via binaryen) separately. `-Oz` typically shrinks the binary ~23% (1.3MB → 1.0MB).

---

## Testing Strategy

### Rust TDD (primary)

`crates/core` compiles to native Rust — fast `cargo test` cycle, no WASM overhead.

| Category | Examples |
|----------|---------|
| Parser unit tests | Each type: simple, edge cases, nested blocks, missing/blank-line tags |
| Citation parsing | Single, batch, mixed-type, malformed input |
| Resolver | Lookup hit/miss, duplicate IDs |
| Renderer | Single ref, consecutive range, non-consecutive, mixed types, prefix selection |
| Template | Each variable, combined templates, edge cases |
| Integration | Full document: parse → resolve → render end-to-end |

### WASM boundary tests

`wasm-pack test` verifies JSON serialization roundtrip and correct UTF-16 offsets.

---

## Implementation Sequence

| # | Component | Scope |
|---|-----------|-------|
| 1 | Project scaffold | Cargo workspace, package.json, configs, CI |
| 2 | Core types + config | `types.rs`, `config.rs`, `i18n.rs` |
| 3 | Parser framework | `DefinitionParser` trait, `ScanContext`, scanner |
| 4 | Figure parser | Images + sub-figures (TDD) |
| 5 | Table parser | Caption detection (TDD) |
| 6 | Section parser | Hierarchical numbering (TDD) |
| 7 | Equation parser | Same-line + next-line, display + inline (TDD) |
| 8 | Listing parser | Fenced code + next-line tag (TDD) |
| 9 | Citation parser | `[@...]` syntax, batch, mixed (TDD) |
| 10 | Resolver + renderer | Reference map, batch rendering, ranges (TDD) |
| 11 | Template engine | `{tag:n}`, `{filename}`, `{index}`, `{ext}` (TDD) |
| 12 | WASM binding | wasm-bindgen exports, JSON bridge |
| 13 | TS bridge + build | WASM loading, esbuild integration |
| 14 | TS reading-mode | MarkdownPostProcessor using WASM |
| 15 | TS live-mode | CodeMirror 6 decorations using WASM |
| 16 | TS suggest | EditorSuggest using WASM definitions |
| 17 | TS listeners | Image/table auto-labeling |
| 18 | Settings UI | All reference types, pandoc config, i18n |
