# Implementation Notes

Technical notes on how TurboRef is built. Read ARCHITECTURE.md first for the high-level design.

## Rust Core (`crates/core`)

### Single-Pass Scanner

`parser/scan.rs::scan_document()` iterates all lines once. A `ScanContext` struct tracks whether we're inside a fenced code block, display math block, or HTML sub-figure div. These flags prevent false matches (e.g., a `{#fig:id}` inside a code block is ignored).

Context updates happen **before** parser dispatch:
- Code fence open/close → `in_code_block`, `prev_line_closed_code`
- `$$` on its own line → `in_math_block`, `prev_line_closed_math`
- `<div id="fig:...">` / `</div>` → `in_html_div`

Lines inside code/math blocks are `continue`d — parsers never see them.

### Parser Dispatch

Each parser implements `DefinitionParser::on_line(&self, line, ..., ctx, counters, config) -> Vec<Definition>`. The scanner calls every registered parser for each non-skipped line. Parsers check `ctx` flags to decide whether to act.

Mutable state lives in `Counters` (passed as `&mut`), not in the parser structs themselves. This is because the trait requires `&self` (for `Send + Sync`).

### Figure Sub-figure State Machine

The figure parser uses `counters.sub_fig: SubFigState` to track sub-figure block accumulation:

```
<div id="fig:main">     → sub_fig.active = true, fig_count++
  ![Cat](cat.png){...}  → emit SubNumbered(fig_count, 'a')
  ![Dog](dog.png){...}  → emit SubNumbered(fig_count, 'b')
  Caption text           → accumulated for later
</div>                   → emit Simple(fig_count) with caption, reset sub_fig
```

Caption extraction scans accumulated lines backwards, skipping images and div tags.

### Equation Detection

Three patterns, checked in priority order:

1. **Next-line tag after display math block**: Scanner sets `prev_line_closed_math = true` after a standalone `$$` closes the block. Equation parser checks for `{#eq:id}` on that next line.
2. **Same-line display**: `$$E = mc^2$${#eq:einstein}` — regex on whole line.
3. **Same-line inline**: `$E = mc^2${#eq:einstein}` — regex with negative check for `$$`.

The next-line pattern requires the scanner's context tracking since the closing `$$` and the `{#eq:id}` tag are on separate lines.

### Listing Detection

Only next-line: scanner sets `prev_line_closed_code = true` after a closing fence. Listing parser checks for `{#lst:id}` on that line. A blank line between the fence and tag breaks the association.

### Citation Parsing

`citation.rs::scan_citations()` finds all `[@...]` patterns in the document using regex. It computes UTF-16 code unit offsets (not byte offsets) for each citation's start/end positions, since CodeMirror 6 uses UTF-16 internally.

The offset computation builds two lookup tables:
- `utf16_offsets[char_index] → utf16_position`
- `byte_to_char[byte_index] → char_index`

### Renderer: Range Detection

When rendering batch citations like `[@fig:a;@fig:b;@fig:c]`:
1. Group refs by `RefType`
2. For each group, extract `RefNumber::as_sortable_u32()` values
3. If all are `Simple(n)` and consecutive → render as range "1-3"
4. Otherwise → comma-separated "1, 3, 5"
5. Select prefix from config array by count: index `min(count-1, len-1)` for singular/plural

### Template Engine

`template.rs::expand()` replaces `{tag:n}` with `n` random alphanumeric chars (via `rand` crate), `{filename}` / `{index}` / `{ext}` from the provided `TemplateContext`.

## WASM Boundary (`crates/wasm`)

### Target and Loading

Built with `wasm-pack --target web`, which generates an `initSync()` function. The TS bridge calls:

```typescript
initSync({ module: wasmBinary });
```

where `wasmBinary` is read from disk via Obsidian's `FileSystemAdapter.readBinary()`. After init, the exported functions (`parse_document`, `resolve_citations`, `get_definitions`, `expand_template`) are available as regular JS function calls.

### Serialization

All data crosses the WASM boundary as JSON strings via `serde_json`. This avoids the complexity of wasm-bindgen typed structs for complex enums (`RefType`, `RefNumber`) and collections (`HashMap`, `Vec`).

### getrandom

The `rand` crate needs `getrandom` with the `js` feature flag for WASM targets. This is declared in `crates/wasm/Cargo.toml` — it enables `crypto.getRandomValues()` as the entropy source.

### wasm-opt

`wasm-pack` 0.9.1's bundled `wasm-opt` doesn't support Apple Silicon. We disable it in `Cargo.toml` (`wasm-opt = false`) and run the system-installed `wasm-opt` (from `binaryen` via Homebrew) separately in `install.sh`. This shrinks the binary from ~1.3MB to ~1.0MB with `-Oz`.

## TypeScript Layer (`src/`)

### Bridge (`bridge.ts`)

Thin wrapper around the WASM exports. Each method calls the corresponding WASM function with raw strings and `JSON.parse`s the result. No caching yet — every call re-parses the full document.

### Reading Mode (`renderer/reading-mode.ts`)

Obsidian `MarkdownPostProcessor`. On each section render:
1. Read full file content via `vault.cachedRead()`
2. Call `bridge.resolveCitations(content, configJson)`
3. TreeWalker finds `[@...]` text nodes → replaces with styled `<span class="turboref-citation">`
4. Second pass removes `{#type:id}` definition markers from visible text

### Live Mode (`renderer/live-mode.ts`)

CodeMirror 6 `EditorView.decorations.compute(["doc", "selection"])`:
1. Call `bridge.resolveCitations()` on full doc content
2. For each resolved citation, skip if cursor is within ±1 char of the range
3. Add `Decoration.replace()` with `CrossrefWidget` for the rest

The `CrossrefWidget` renders a styled `<span>` via `toDOM()`. Invalid refs get the `.invalid` class (strikethrough + error color).

### EditorSuggest (`suggest.ts`)

Triggered by `[@`. Two-phase completion:
1. **Type phase**: no `:` yet → suggest `fig:`, `tbl:`, `sec:`, `eq:`, `lst:`
2. **ID phase**: after `:` → call `bridge.getDefinitions()` and filter by type + partial ID match

Handles batch refs via `;` — re-triggers suggestion from the last semicolon.

### Listeners

- **ImageEventListener**: hooks `editor-paste` and `editor-drop`. After a 200ms delay (letting paste complete), checks if the line has a markdown image without `{#fig:id}` and appends one using `bridge.expandTemplate()`.
- **TableListener**: hooks `editor-change`. Detects table header+separator patterns, checks if a caption already exists after the table, and inserts `: Caption {#tbl:id}` if not.

## Build Pipeline

```
wasm-pack build crates/wasm --target web --release
  → crates/wasm/pkg/turboref_wasm.js + turboref_wasm_bg.wasm

wasm-opt -Oz (if available)
  → smaller .wasm binary

node esbuild.config.mjs production
  → main.js (bundles src/ + wasm-pack's .js glue; .wasm stays separate)
```

esbuild treats the wasm-pack `.js` output as a regular module and inlines it into `main.js`. The `.wasm` binary is loaded at runtime from the plugin directory.

## Test Coverage

98 unit tests in `crates/core`, run via `cargo test -p turboref-core`. No WASM or browser required — the core crate is pure Rust with zero platform dependencies.

| Module | Tests |
|--------|-------|
| types | 4 |
| config | 5 |
| i18n | 2 |
| parser/scan | 5 |
| parser/figure | 10 |
| parser/table | 7 |
| parser/section | 9 |
| parser/equation | 11 |
| parser/listing | 8 |
| citation | 13 |
| renderer | 11 |
| template | 8 |
| document (e2e) | 3 |
| resolver | 2 |
