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

Each parser implements `DefinitionParser::on_line(&self, line, ..., ctx, counters, config) -> Vec<Definition>`. The scanner calls every registered parser for each non-skipped line. Parsers check `ctx` flags to decide whether to act. After all lines, `on_end(&self, counters) -> Vec<Definition>` is called to flush pending state.

Mutable state lives in `Counters` (passed as `&mut`), not in the parser structs themselves. This is because the trait requires `&self` (for `Send + Sync`).

### Figure Parser

The figure parser supports three definition tag placements:
- **Same-line**: `![desc](img.png){#fig:id}` (with optional whitespace before `{`)
- **Next-line**: `![desc](img.png)\n{#fig:id}`
- **Caption-based sub-figures**: consecutive images + `: Caption {#fig:id}`

**Image Accumulator** — Outside `<div>` blocks, consecutive images are buffered in `counters.image_acc: ImageAccumulator`. The accumulator is flushed in three ways:
1. `: Caption {#fig:id}` line → `finalize_as_subfigures()` — assigns SubNumbered(n, a/b/c...) to each image, emits main figure as Simple(n)
2. Non-image/non-caption line → `flush_accumulator()` — each tagged image becomes a standalone Simple(n)
3. End of document → `on_end()` calls `flush_accumulator()`

Images without `{#fig:id}` in a sub-figure group consume a sub-letter but emit no definition.

**HTML div syntax** (for pandoc export) uses the separate `SubFigState` mechanism:
```
<div id="fig:main">     → sub_fig.active = true, fig_count++
  ![Cat](cat.png){...}  → emit SubNumbered(fig_count, 'a')
  ![Dog](dog.png){...}  → emit SubNumbered(fig_count, 'b')
  Caption text           → accumulated for later
</div>                   → emit Simple(fig_count) with caption, reset sub_fig
```

The two mechanisms are mutually exclusive: `image_acc` is only used when `sub_fig.active == false`. Entering a `<div>` flushes the accumulator first.

### Equation Detection

Three patterns, checked in priority order:

1. **Next-line tag after display math block**: Scanner sets `prev_line_closed_math = true` after a standalone `$$` closes the block. Equation parser checks for `{#eq:id}` on that next line.
2. **Same-line display**: `$$E = mc^2$${#eq:einstein}` — regex on whole line.
3. **Same-line inline**: `$E = mc^2${#eq:einstein}` — regex with negative check for `$$`.

The next-line pattern requires the scanner's context tracking since the closing `$$` and the `{#eq:id}` tag are on separate lines.

### Figure Tags After Code Blocks

The figure parser also checks `ctx.prev_line_closed_code` for `{#fig:id}` tags. This enables tagging diagram code blocks (mermaid, graphviz/dot, d2, plantuml, excalidraw, tikz) that Obsidian renders as images:

````markdown
```mermaid
graph LR
    A --> B
```
{#fig:diagram}
````

Works for any fenced code block type — the scanner sets `prev_line_closed_code` regardless of the info string.

### Listing Detection

Only next-line: scanner sets `prev_line_closed_code = true` after a closing fence. Listing parser checks for `{#lst:id}` on that line. A blank line between the fence and tag breaks the association.

### Citation Parsing

`citation.rs::scan_citations()` finds all `[@...]` patterns in the document using regex. It computes UTF-16 code unit offsets (not byte offsets) for each citation's start/end positions, since CodeMirror 6 uses UTF-16 internally.

The offset computation builds two lookup tables:
- `utf16_offsets[char_index] → utf16_position`
- `byte_to_char[byte_index] → char_index`

### Renderer: Range Detection and Navigation Targets

When rendering batch citations like `[@fig:a;@fig:b;@fig:c]`:
1. Group refs by `RefType`
2. For each group, extract `RefNumber::as_sortable_u32()` values
3. If all are `Simple(n)` and consecutive → render as range "1-3"
4. Otherwise → comma-separated "1, 3, 5"
5. Select prefix from config array by count: index `min(count-1, len-1)` for singular/plural

Each `ResolvedCitation` also carries `target_line` and `target_char_offset` — the position of the first resolved definition. This enables click-to-navigate: the TS widget reads these fields and dispatches a scroll + cursor placement on mouse click. For batch citations, the first ref's definition is used as the navigation target.

### Definition Tag Scanner

`definition_tag.rs::scan_definition_tags()` finds all `{#type:id}` patterns in the document using regex `\{#(\w+):([^}]+)\}`, returning their precise UTF-16 start/end positions. Tags inside fenced code blocks and display math blocks are skipped via pre-computed excluded byte ranges.

`resolve_definition_tags()` joins scanned tags with the `ReferenceMap` to produce `ResolvedDefinitionTag` values. Resolved tags render as `"#Prefix Number"` (e.g., "#Fig. 1") — the hash prefix distinguishes definitions from citations visually.

### Template Engine

`template.rs::expand()` replaces `{tag:n}` with `n` random alphanumeric chars (via `rand` crate), `{filename}` / `{index}` / `{ext}` from the provided `TemplateContext`.

## WASM Boundary (`crates/wasm`)

### Target and Loading

Built with `wasm-pack --target web`, which generates an `initSync()` function. The TS bridge calls:

```typescript
initSync({ module: wasmBinary });
```

where `wasmBinary` is read from disk via Obsidian's `FileSystemAdapter.readBinary()`. After init, the exported functions (`parse_document`, `resolve_citations`, `get_definitions`, `resolve_all_decorations`, `expand_template`) are available as regular JS function calls.

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
1. Single WASM call: `bridge.resolveAllDecorations(content, configJson)` → returns both citations and definition tags
2. Collect decoration entries from both arrays, skipping cursor-overlapping ranges (±1 buffer)
3. Sort all entries by start position (CM6's `RangeSetBuilder` requirement)
4. Add `Decoration.replace()` with `CrossrefWidget` for citations and `DefinitionWidget` for definition tags

**CrossrefWidget** renders citations as styled `<span class="turboref-citation">` (accent color, solid border). **DefinitionWidget** renders definition tags as `<span class="turboref-definition">` (muted color, dashed border, smaller font).

**Click-to-navigate on citation widgets**: When a user mouse-clicks a rendered citation (e.g., "Fig. 1"), the plugin scrolls to the definition location and blinks the target line with a highlight animation. This uses `ResolvedCitation.target_char_offset` — populated in `renderer.rs` from the first resolved `Definition`'s `char_offset`. The widget dispatches `view.dispatch({ selection: { anchor: targetOffset }, scrollIntoView: true })`, then applies the `.turboref-highlight-blink` CSS class to the target `.cm-line` element via `requestAnimationFrame`. The highlight fades out over 1.5s via CSS `@keyframes`.

Arrow-key cursor movement into a citation still expands it in-place (the cursor-aware decoration skip handles this). Only the `mousedown` handler on the widget triggers navigation.

**Reading mode click-to-navigate**: Citation spans in reading mode have `click` handlers that call `navigateToLine()`, which opens the file in editing mode at the target line via `leaf.openFile(file, { eState: { line: targetLine } })`, then applies the same highlight blink on the target line's `.cm-line` DOM element.

**Click-to-edit on definition widgets**: `DefinitionWidget` click places the cursor at the tag itself (it's already at the definition). `Decoration.replace` widgets swallow mouse events — CM6 does not place the cursor inside a replaced range on click. The fix is to handle `mousedown` directly on the widget DOM element, calling `preventDefault()` + `stopPropagation()` then `setTimeout(0)` to dispatch after CM6's event cycle.

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

158 unit tests in `crates/core`, run via `cargo test -p turboref-core`. No WASM or browser required — the core crate is pure Rust with zero platform dependencies.

| Module | Tests |
|--------|-------|
| types | 4 |
| config | 5 |
| i18n | 2 |
| parser/scan | 5 |
| parser/figure | 44 |
| parser/table | 8 |
| parser/section | 9 |
| parser/equation | 11 |
| parser/listing | 8 |
| citation | 13 |
| definition_tag | 21 |
| renderer | 15 |
| template | 8 |
| document (e2e) | 3 |
| resolver | 2 |
