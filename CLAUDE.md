# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TurboRef is an Obsidian plugin for pandoc-crossref-compatible cross-referencing. It has a **Rust/WASM core** for all parsing and resolution logic, and a **TypeScript UI layer** for Obsidian integration.

Supports 5 crossref types: `fig`, `tbl`, `sec`, `eq`, `lst` — plus trait-based extensibility for custom types. Also supports **citeproc** bibliographic citations from `.bib` files (parsed and rendered on the TypeScript side), including `[-@key]` author-suppression syntax and locator suffixes (`[@key, ch. 11]`, `[@key, pp. 45-50]`).

## Build Commands

```bash
cargo test -p turboref-core          # Run 166 Rust unit tests
npx vitest run                       # Run 53 TypeScript unit tests (bib parser/renderer/resolver)
npm test                             # Run both Rust + TypeScript tests
wasm-pack build crates/wasm --target web --release   # Build WASM
node esbuild.config.mjs production   # Bundle TypeScript
./install.sh                         # Full build + install to Obsidian vault
./install.sh /path/to/vault          # Install to specific vault
```

## Architecture

Two-crate Rust workspace + TypeScript:

- **`crates/core`** — Pure Rust library (zero WASM deps). All parsing, numbering, citation resolution, rendering, template expansion. This is the TDD target.
- **`crates/wasm`** — Thin `wasm-bindgen` wrapper. Exports 5 functions (`parse_document`, `resolve_citations`, `get_definitions`, `resolve_all_decorations`, `expand_template`), JSON in/out. `ResolvedCitation` includes `target_line`/`target_char_offset` for click-to-navigate.
- **`src/`** — TypeScript. Obsidian plugin lifecycle, CodeMirror 6 live rendering, MarkdownPostProcessor for reading mode, EditorSuggest for `[@` completion, image/table event listeners, settings UI. Clicking a citation navigates to the definition with a highlight blink.
- **`src/bib/`** — TypeScript-only citeproc pipeline. BibTeX parser, "Author Year" renderer with disambiguation (+ year-only for `[-@key]`), frontmatter `bibliography` path resolver, in-memory/Redis cache. No Rust involvement — bib entries are external data, not in-document definitions.

### Data Flow

```
Document content + config JSON
  → [WASM] scan_document() — single-pass line scanner with ScanContext
    → each DefinitionParser::on_line() emits Definitions
  → [WASM] scan_citations() — finds [@...] patterns with UTF-16 offsets
  → [WASM] resolve_all() — looks up definitions, renders batch/ranges
  → [TS] applies results to DOM (reading mode) or CodeMirror decorations (live mode)
```

### Key Design Decisions

- **WASM boundary is stateless JSON**: each call takes full `(content, config_json)`, returns JSON. TS side caches if needed.
- **`--target web`** for wasm-pack: generates `initSync()` which takes a `BufferSource` directly. Loaded via `FileSystemAdapter.readBinary()`.
- **UTF-16 offsets** in all position data — matches CodeMirror 6's internal model.
- **`getrandom` with `js` feature** in the wasm crate for `rand` support on WASM targets.
- **`wasm-opt = false`** in Cargo.toml (wasm-pack's bundled binary doesn't support Apple Silicon). System `wasm-opt` run separately in `install.sh`.
- **Bib click-to-navigate via login shell**: External editor commands are run through `$SHELL -l -c` (not `/bin/sh`) because Electron apps launched from Finder don't inherit the terminal's PATH. Configurable via `bibEditorCommand` setting (default: `subl {file}:{line}`).

### Parser Extensibility

New reference types implement `DefinitionParser` trait in `crates/core/src/parser/`:

```rust
pub trait DefinitionParser: Send + Sync {
    fn ref_type(&self) -> RefType;
    fn prefix_str(&self) -> &str;
    fn on_line(&self, line, line_idx, char_offset, ctx, counters, config) -> Vec<Definition>;
    fn on_end(&self, counters: &mut Counters) -> Vec<Definition> { Vec::new() }
}
```

`on_end()` flushes pending state at EOF (e.g., figure parser's image accumulator).

Register in `ParserRegistry::with_builtins()` in `parser/mod.rs`.

### Scanner Context Flags

Parsers check `ScanContext` to avoid false matches:
- `in_code_block` — inside fenced code (``` or ~~~)
- `in_math_block` — inside display math (`$$` on its own line)
- `prev_line_closed_math` — equation parser checks this for next-line `{#eq:id}` tags
- `prev_line_closed_code` — listing parser checks for `{#lst:id}`, figure parser checks for `{#fig:id}` (diagram code blocks)

## File Layout

```
crates/core/src/
  parser/          # DefinitionParser trait + 5 parsers (figure, table, section, equation, listing)
    scan.rs        # ScanContext + single-pass scanner
  citation.rs      # [@...] pattern scanning with UTF-16 offsets
  definition_tag.rs # {#type:id} tag scanning + resolution for live rendering
  renderer.rs      # Citation → rendered text (batch, range, prefix selection)
  resolver.rs      # ReferenceMap (id → Definition lookup)
  template.rs      # {tag:n}, {filename}, {index}, {ext} expansion
  document.rs      # Orchestrator: parse → resolve → render
  config.rs        # DocumentConfig (merged from settings + frontmatter)
  types.rs         # RefType, RefNumber, Definition, Citation, ResolvedCitation
  i18n.rs          # Locale-specific defaults (en, zh)

src/
  main.ts          # Plugin entry, wires all components + bib event handlers
  bridge.ts        # WASM loader (initSync) + typed wrappers
  config.ts        # PluginSettings, buildDocumentConfigJson()
  suggest.ts       # EditorSuggest for [@... autocompletion (crossref types + bib keys)
  settings.ts      # Settings UI tab (incl. citeproc + Redis settings)
  renderer/
    reading-mode.ts  # MarkdownPostProcessor (crossref + citeproc passes)
    live-mode.ts     # CodeMirror 6 decorations (crossref + citeproc passes)
    widgets.ts       # CrossrefWidget, DefinitionWidget, CiteprocWidget (per-part click nav)
  bib/
    types.ts       # BibEntry interface
    parser.ts      # BibTeX file parser
    renderer.ts    # "Author Year" formatter with disambiguation, year-only for [-@key], parseCiteprocKeys() for locator extraction
    resolver.ts    # Frontmatter bibliography path resolution
    cache.ts       # MemoryBibCache (default) + RedisBibCache (opt-in)
    open-external.ts # Open .bib file at line via configurable editor command ($SHELL -l -c)
    __tests__/     # vitest unit tests (parser, renderer, resolver)
  listeners/
    image.ts       # Paste/drop → auto {#fig:id}
    table.ts       # Table detection → auto caption
```
