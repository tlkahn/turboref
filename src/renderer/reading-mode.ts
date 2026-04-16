import { FileSystemAdapter, MarkdownPostProcessorContext, MarkdownView, TFile } from "obsidian";
import type TurboRefPlugin from "../main";
import { buildDocumentConfigJson } from "../config";
import { openBibFileAtLine } from "../bib/open-external";
import { renderBibCitationYearOnly, parseCiteprocKeys } from "../bib/renderer";

// Regex to find definition markers in rendered text
const DEF_MARKER_RE = /\s*\{#(?:fig|tbl|sec|eq|lst):[^}]+\}/g;

/**
 * Creates a MarkdownPostProcessor that resolves cross-references in reading mode.
 */
export function createPostProcessor(plugin: TurboRefPlugin) {
    return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        if (!plugin.settings.enableCrossrefRendering) return;

        const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
        if (!(file instanceof TFile)) return;

        const cache = plugin.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;
        const configJson = buildDocumentConfigJson(plugin.settings, frontmatter);

        // We need the full file content for parsing — read from cache or section info
        const sectionInfo = ctx.getSectionInfo(el);
        if (!sectionInfo) return;

        plugin.app.vault.cachedRead(file).then((content) => {
            try {
                const resolved = plugin.bridge.resolveCitations(content, configJson);

                // Replace citation text in DOM
                replaceCitationsInDom(el, resolved, plugin, ctx);

                // Citeproc pass: replace [@barekey] patterns not matched by crossref
                if (plugin.settings.enableCiteprocRendering && plugin.currentBibEntries?.length) {
                    const crossrefOriginals = new Set(resolved.map((r: ResolvedCitation) => r.original));
                    replaceCiteprocInDom(el, crossrefOriginals, plugin, ctx);
                }

                // Hide definition markers
                hideDefMarkers(el);
            } catch (e) {
                console.error("[TurboRef] Reading-mode render error:", e);
            }
        });
    };
}

interface ResolvedCitation {
    rendered_text: string;
    is_valid: boolean;
    original: string;
    target_line: number | null;
    target_char_offset: number | null;
}

/**
 * Navigate to a line in editing mode and highlight it.
 */
function navigateToLine(plugin: TurboRefPlugin, sourcePath: string, targetLine: number) {
    const leaf = plugin.app.workspace.getMostRecentLeaf();
    if (!leaf) return;

    const file = plugin.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) return;

    // Open the file in editing mode at the target line
    leaf.openFile(file, {
        eState: { line: targetLine },
    }).then(() => {
        // After navigation, highlight the target line
        const view = leaf.view;
        if (view instanceof MarkdownView && view.editor) {
            const editor = view.editor;
            editor.setCursor({ line: targetLine, ch: 0 });
            // Highlight via DOM
            setTimeout(() => {
                const cmEditor = (editor as any).cm as any; // CodeMirror EditorView
                if (cmEditor?.domAtPos) {
                    try {
                        const line = cmEditor.state.doc.line(targetLine + 1);
                        const domPos = cmEditor.domAtPos(line.from);
                        const cmLine = (domPos.node as HTMLElement).closest?.(".cm-line")
                            ?? domPos.node.parentElement?.closest(".cm-line");
                        if (cmLine) {
                            cmLine.classList.add("turboref-highlight-blink");
                            setTimeout(() => cmLine.classList.remove("turboref-highlight-blink"), 1500);
                        }
                    } catch { /* ignore */ }
                }
            }, 100);
        }
    });
}

/**
 * Walk text nodes and replace [@...] citations with styled spans.
 */
function replaceCitationsInDom(el: HTMLElement, resolved: ResolvedCitation[], plugin: TurboRefPlugin, ctx: MarkdownPostProcessorContext) {
    if (resolved.length === 0) return;

    // Build a map from original text to rendered
    const renderMap = new Map<string, ResolvedCitation>();
    for (const r of resolved) {
        renderMap.set(r.original, r);
    }

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodesToReplace: { node: Text; replacements: { start: number; end: number; citation: ResolvedCitation }[] }[] = [];

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
        const text = node.textContent || "";
        const replacements: { start: number; end: number; citation: ResolvedCitation }[] = [];

        // Find all [@...] patterns in this text node
        const citationRe = /\[@[^\]]+\]/g;
        let match;
        while ((match = citationRe.exec(text)) !== null) {
            const original = match[0];
            const citation = renderMap.get(original);
            if (citation) {
                replacements.push({
                    start: match.index,
                    end: match.index + original.length,
                    citation,
                });
            }
        }

        if (replacements.length > 0) {
            nodesToReplace.push({ node, replacements });
        }
    }

    // Apply replacements (in reverse to preserve positions)
    for (const { node, replacements } of nodesToReplace) {
        const text = node.textContent || "";
        const fragment = document.createDocumentFragment();
        let lastEnd = 0;

        for (const { start, end, citation } of replacements) {
            // Text before this citation
            if (start > lastEnd) {
                fragment.appendChild(document.createTextNode(text.slice(lastEnd, start)));
            }

            // Create styled span with click-to-navigate
            const span = document.createElement("span");
            span.className = `turboref-citation ${citation.is_valid ? "" : "invalid"}`.trim();
            span.textContent = citation.rendered_text;
            span.title = citation.original;

            if (citation.target_line != null) {
                span.style.cursor = "pointer";
                span.addEventListener("click", () => {
                    navigateToLine(plugin, ctx.sourcePath, citation.target_line!);
                });
            }

            fragment.appendChild(span);

            lastEnd = end;
        }

        // Remaining text after last citation
        if (lastEnd < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastEnd)));
        }

        node.parentNode?.replaceChild(fragment, node);
    }
}

interface CiteprocReplacement {
    start: number;
    end: number;
    parts: { rendered: string; bibFile: string; lineNumber: number }[];
}

/**
 * Walk text nodes and replace [@barekey] citeproc citations with styled spans.
 * Each key in a batch citation gets its own clickable span.
 */
function replaceCiteprocInDom(
    el: HTMLElement,
    crossrefOriginals: Set<string>,
    plugin: TurboRefPlugin,
    _ctx: MarkdownPostProcessorContext
) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodesToReplace: { node: Text; replacements: CiteprocReplacement[] }[] = [];

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
        const text = node.textContent || "";
        const replacements: CiteprocReplacement[] = [];

        const citeprocRe = /\[(-?@[a-zA-Z][\w.\-]*(?:\s*,[^;\]]*)?(?:\s*;\s*-?@?[a-zA-Z][\w.\-]*(?:\s*,[^;\]]*)?)*)\]/g;
        let match;
        while ((match = citeprocRe.exec(text)) !== null) {
            const original = match[0];
            const inner = match[1];

            if (crossrefOriginals.has(original)) continue;
            if (inner.includes(":")) continue;

            const keyParts = parseCiteprocKeys(inner);
            const parts: { rendered: string; bibFile: string; lineNumber: number }[] = [];

            for (const { key, suppress, locator } of keyParts) {
                const bibEntry = plugin.currentBibEntries?.find((e) => e.key === key);
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
                replacements.push({
                    start: match.index,
                    end: match.index + original.length,
                    parts,
                });
            }
        }

        if (replacements.length > 0) {
            nodesToReplace.push({ node, replacements });
        }
    }

    const adapter = plugin.app.vault.adapter;
    const isDesktop = adapter instanceof FileSystemAdapter;

    for (const { node, replacements } of nodesToReplace) {
        const text = node.textContent || "";
        const fragment = document.createDocumentFragment();
        let lastEnd = 0;

        for (const { start, end, parts } of replacements) {
            if (start > lastEnd) {
                fragment.appendChild(document.createTextNode(text.slice(lastEnd, start)));
            }

            const wrapper = document.createElement("span");
            wrapper.className = "turboref-citeproc";

            for (let i = 0; i < parts.length; i++) {
                if (i > 0) {
                    wrapper.appendChild(document.createTextNode("; "));
                }

                const part = parts[i];
                const partSpan = document.createElement("span");
                partSpan.className = "turboref-citeproc-part";
                partSpan.textContent = part.rendered;
                partSpan.style.cursor = "pointer";

                if (part.bibFile && isDesktop) {
                    partSpan.addEventListener("click", () => {
                        openBibFileAtLine(
                            adapter as FileSystemAdapter,
                            part.bibFile,
                            part.lineNumber,
                            plugin.settings.bibEditorCommand
                        );
                    });
                }

                wrapper.appendChild(partSpan);
            }

            fragment.appendChild(wrapper);
            lastEnd = end;
        }

        if (lastEnd < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastEnd)));
        }

        node.parentNode?.replaceChild(fragment, node);
    }
}

/**
 * Remove {#type:id} definition markers from rendered text.
 */
function hideDefMarkers(el: HTMLElement) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const toUpdate: { node: Text; newText: string }[] = [];

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
        const text = node.textContent || "";
        if (DEF_MARKER_RE.test(text)) {
            toUpdate.push({ node, newText: text.replace(DEF_MARKER_RE, "") });
            DEF_MARKER_RE.lastIndex = 0; // reset regex state
        }
    }

    for (const { node, newText } of toUpdate) {
        node.textContent = newText;
    }
}
