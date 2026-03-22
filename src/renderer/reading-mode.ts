import { MarkdownPostProcessorContext, TFile } from "obsidian";
import type TurboRefPlugin from "../main";
import { buildDocumentConfigJson } from "../config";

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
                replaceCitationsInDom(el, resolved);

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
}

/**
 * Walk text nodes and replace [@...] citations with styled spans.
 */
function replaceCitationsInDom(el: HTMLElement, resolved: ResolvedCitation[]) {
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

            // Create styled span
            const span = document.createElement("span");
            span.className = `turboref-citation ${citation.is_valid ? "" : "invalid"}`.trim();
            span.textContent = citation.rendered_text;
            span.title = citation.original;
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
