import { EditorView, Decoration, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Extension, RangeSetBuilder } from "@codemirror/state";
import type TurboRefPlugin from "../main";
import { buildDocumentConfigJson } from "../config";
import { CrossrefWidget, DefinitionWidget, CiteprocWidget, CiteprocPart } from "./widgets";
import { renderBibCitationYearOnly, parseCiteprocKeys } from "../bib/renderer";

/**
 * Creates CodeMirror 6 extensions for live cross-reference rendering in editing mode.
 */
export function createLiveModeExtension(plugin: TurboRefPlugin): Extension {
    return [
        createDecorationExtension(plugin),
        createViewPlugin(plugin),
    ];
}

interface DecorationEntry {
    start: number;
    end: number;
    decoration: Decoration;
}

function createDecorationExtension(plugin: TurboRefPlugin): Extension {
    return EditorView.decorations.compute(["doc", "selection"], (state) => {
        if (!plugin.settings.enableLiveRendering) {
            return Decoration.none;
        }

        try {
            const builder = new RangeSetBuilder<Decoration>();
            const content = state.doc.toString();

            const cursorPos = state.selection.main.head;
            const selStart = state.selection.main.from;
            const selEnd = state.selection.main.to;

            const file = plugin.app.workspace.getActiveFile();
            if (!file) return Decoration.none;

            const cache = plugin.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;
            const configJson = buildDocumentConfigJson(plugin.settings, frontmatter);

            // Single WASM call returns both citations and definition tags
            const all = plugin.bridge.resolveAllDecorations(content, configJson);
            const entries: DecorationEntry[] = [];

            // Collect citation decorations
            for (const citation of all.citations) {
                const start = citation.char_start;
                const end = citation.char_end;

                if (isInEditableRange(start, end, cursorPos, selStart, selEnd)) continue;
                if (start < 0 || end > state.doc.length || start >= end) continue;

                entries.push({
                    start,
                    end,
                    decoration: Decoration.replace({
                        widget: new CrossrefWidget(
                            citation.original,
                            citation.rendered_text,
                            citation.is_valid,
                            start,
                            end,
                            citation.target_char_offset
                        ),
                    }),
                });
            }

            // Collect definition tag decorations
            for (const defTag of all.definition_tags) {
                const start = defTag.char_start;
                const end = defTag.char_end;

                if (isInEditableRange(start, end, cursorPos, selStart, selEnd)) continue;
                if (start < 0 || end > state.doc.length || start >= end) continue;
                if (!defTag.is_valid) continue;

                entries.push({
                    start,
                    end,
                    decoration: Decoration.replace({
                        widget: new DefinitionWidget(
                            defTag.original,
                            defTag.rendered_text,
                            defTag.is_valid,
                            start,
                            end
                        ),
                    }),
                });
            }

            // Citeproc citation pass: find [@barekey] patterns not matched by crossref
            if (plugin.settings.enableCiteprocRendering && plugin.currentBibEntries?.length) {
                const crossrefOriginals = new Set(all.citations.map((c: any) => c.original));
                const bibRe = /\[(-?@[a-zA-Z][\w.\-]*(?:\s*,[^;\]]*)?(?:\s*;\s*-?@?[a-zA-Z][\w.\-]*(?:\s*,[^;\]]*)?)*)\]/g;
                let bibMatch;

                while ((bibMatch = bibRe.exec(content)) !== null) {
                    const fullMatch = bibMatch[0];
                    const inner = bibMatch[1];

                    // Skip if this was already matched by crossref (contains colon)
                    if (crossrefOriginals.has(fullMatch)) continue;
                    if (inner.includes(":")) continue;

                    const start = bibMatch.index;
                    const end = start + fullMatch.length;

                    if (isInEditableRange(start, end, cursorPos, selStart, selEnd)) continue;
                    if (start < 0 || end > state.doc.length || start >= end) continue;

                    // Look up each key in the bib entries
                    const keyParts = parseCiteprocKeys(inner);
                    const parts: CiteprocPart[] = [];

                    for (const { key, suppress, locator } of keyParts) {
                        const bibEntry = plugin.currentBibEntries.find((e) => e.key === key);
                        const base = bibEntry
                            ? (suppress ? renderBibCitationYearOnly(bibEntry) : (plugin.bibRenderedForms?.get(key) ?? key))
                            : key;
                        parts.push({
                            rendered: locator ? `${base}, ${locator}` : base,
                            bibFile: bibEntry?.bibFile ?? "",
                            lineNumber: bibEntry?.lineNumber ?? 0,
                        });
                    }

                    if (parts.length > 0) {
                        entries.push({
                            start,
                            end,
                            decoration: Decoration.replace({
                                widget: new CiteprocWidget(
                                    fullMatch,
                                    parts,
                                    start,
                                    end,
                                    plugin.app.vault.adapter as any,
                                    plugin.settings.bibEditorCommand
                                ),
                            }),
                        });
                    }
                }
            }

            // RangeSetBuilder requires sorted order by start position
            entries.sort((a, b) => a.start - b.start);

            for (const entry of entries) {
                builder.add(entry.start, entry.end, entry.decoration);
            }

            return builder.finish();
        } catch (e) {
            console.error("[TurboRef] Live-mode decoration error:", e);
            return Decoration.none;
        }
    });
}

function createViewPlugin(plugin: TurboRefPlugin): Extension {
    return ViewPlugin.fromClass(
        class {
            constructor(private view: EditorView) {}

            update(update: ViewUpdate) {
                if (!plugin.settings.enableLiveRendering) return;
            }
        }
    );
}

function isInEditableRange(
    refStart: number,
    refEnd: number,
    cursorPos: number,
    selStart: number,
    selEnd: number
): boolean {
    const buffer = 1;
    const expandedStart = Math.max(0, refStart - buffer);
    const expandedEnd = refEnd + buffer;

    if (selStart !== selEnd) {
        return !(expandedEnd <= selStart || expandedStart >= selEnd);
    }

    return cursorPos >= expandedStart && cursorPos <= expandedEnd;
}
