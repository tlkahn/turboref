import {
    App,
    Editor,
    EditorPosition,
    EditorSuggest,
    EditorSuggestContext,
    EditorSuggestTriggerInfo,
    TFile,
} from "obsidian";
import type TurboRefPlugin from "./main";
import { buildDocumentConfigJson } from "./config";
import type { DefinitionInfo } from "./bridge";

interface SuggestionItem {
    type: "type" | "ref";
    label: string;
    description: string;
    insertText: string;
}

const AVAILABLE_TYPES = ["fig", "tbl", "sec", "eq", "lst"];

export class ReferenceSuggest extends EditorSuggest<SuggestionItem> {
    private plugin: TurboRefPlugin;

    constructor(app: App, plugin: TurboRefPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
        const beforeCursor = line.slice(0, cursor.ch);

        // Find last unmatched [
        const bracketIdx = beforeCursor.lastIndexOf("[");
        if (bracketIdx === -1) return null;

        const afterBracket = beforeCursor.slice(bracketIdx);

        // Must start with [@
        if (!afterBracket.startsWith("[@")) return null;

        // Check not already closed
        const closeBracket = afterBracket.indexOf("]", 2);
        if (closeBracket !== -1) return null;

        // Handle semicolon for batch refs — suggest from last semicolon
        const lastSemicolon = afterBracket.lastIndexOf(";");
        const queryStart = lastSemicolon !== -1 ? lastSemicolon + 1 : 2; // after [@ or after ;
        const query = afterBracket.slice(queryStart).replace(/^@/, "");

        return {
            start: { line: cursor.line, ch: bracketIdx + queryStart },
            end: cursor,
            query,
        };
    }

    getSuggestions(context: EditorSuggestContext): SuggestionItem[] {
        const query = context.query;
        const colonIdx = query.indexOf(":");

        if (colonIdx === -1) {
            // Suggest reference types
            return AVAILABLE_TYPES
                .filter((t) => t.startsWith(query))
                .map((t) => ({
                    type: "type" as const,
                    label: `@${t}:`,
                    description: typeDescription(t),
                    insertText: `${t}:`,
                }));
        }

        // Suggest IDs for the given type
        const typeStr = query.slice(0, colonIdx);
        const partialId = query.slice(colonIdx + 1);

        if (!AVAILABLE_TYPES.includes(typeStr)) return [];

        const file = context.file;
        if (!file) return [];

        try {
            const content = this.plugin.app.vault.getAbstractFileByPath(file.path);
            if (!(content instanceof TFile)) return [];

            // Use cached content — EditorSuggest runs synchronously
            const cache = this.plugin.app.metadataCache.getFileCache(content);
            const frontmatter = cache?.frontmatter;
            const configJson = buildDocumentConfigJson(this.plugin.settings, frontmatter);

            const editor = context.editor;
            const docContent = editor.getValue();
            const defs = this.plugin.bridge.getDefinitions(docContent, configJson);

            return defs
                .filter((d: DefinitionInfo) => d.ref_type === typeStr)
                .filter((d: DefinitionInfo) => !partialId || d.id.includes(partialId))
                .map((d: DefinitionInfo) => ({
                    type: "ref" as const,
                    label: `${typeStr}:${d.id}`,
                    description: `${d.number}${d.caption ? ": " + d.caption : ""}`,
                    insertText: `${typeStr}:${d.id}`,
                }));
        } catch (e) {
            console.error("[TurboRef] Suggest error:", e);
            return [];
        }
    }

    renderSuggestion(item: SuggestionItem, el: HTMLElement): void {
        el.createEl("span", { text: item.label, cls: "turboref-suggest-label" });
        el.createEl("small", { text: ` ${item.description}`, cls: "turboref-suggest-desc" });
    }

    selectSuggestion(item: SuggestionItem, _evt: MouseEvent | KeyboardEvent): void {
        if (!this.context) return;

        const { editor, start, end } = this.context;
        editor.replaceRange(item.insertText, start, end);

        // Move cursor to end of inserted text
        const newCh = start.ch + item.insertText.length;
        editor.setCursor({ line: start.line, ch: newCh });
    }
}

function typeDescription(type: string): string {
    switch (type) {
        case "fig": return "Figure";
        case "tbl": return "Table";
        case "sec": return "Section";
        case "eq": return "Equation";
        case "lst": return "Listing";
        default: return type;
    }
}
