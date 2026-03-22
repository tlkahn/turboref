import { EditorView, Decoration, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { Extension, RangeSetBuilder } from "@codemirror/state";
import type TurboRefPlugin from "../main";
import { buildDocumentConfigJson } from "../config";
import { CrossrefWidget } from "./widgets";

/**
 * Creates CodeMirror 6 extensions for live cross-reference rendering in editing mode.
 */
export function createLiveModeExtension(plugin: TurboRefPlugin): Extension {
    return [
        createDecorationExtension(plugin),
        createViewPlugin(plugin),
    ];
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

            const resolved = plugin.bridge.resolveCitations(content, configJson);

            for (const citation of resolved) {
                const start = citation.char_start;
                const end = citation.char_end;

                // Skip if cursor or selection overlaps (±1 buffer for easier editing)
                if (isInEditableRange(start, end, cursorPos, selStart, selEnd)) {
                    continue;
                }

                // Bounds check
                if (start < 0 || end > state.doc.length || start >= end) {
                    continue;
                }

                const decoration = Decoration.replace({
                    widget: new CrossrefWidget(
                        citation.original,
                        citation.rendered_text,
                        citation.is_valid
                    ),
                });

                builder.add(start, end, decoration);
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
                // Decorations auto-recompute on doc/selection change
                // via the compute() above. This plugin exists for future
                // extension (e.g., debouncing, caching).
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

    // Selection range overlap
    if (selStart !== selEnd) {
        return !(expandedEnd <= selStart || expandedStart >= selEnd);
    }

    // Cursor inside range
    return cursorPos >= expandedStart && cursorPos <= expandedEnd;
}
