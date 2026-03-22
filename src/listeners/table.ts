import { Editor } from "obsidian";
import type TurboRefPlugin from "../main";

const TABLE_HEADER_RE = /^\|.+\|$/;
const TABLE_SEP_RE = /^\|?\s*[-:]+[-| :]*\|?\s*$/;
const TABLE_CAPTION_RE = /^:.*\{#tbl:.*\}$/;

/**
 * Detects table creation in the editor and auto-generates captions with labels.
 */
export class TableListener {
    constructor(private plugin: TurboRefPlugin) {}

    register() {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("editor-change", (editor) => {
                if (!this.plugin.settings.autoAddTblRef) return;
                this.handleChange(editor);
            })
        );
    }

    private handleChange(editor: Editor) {
        const cursor = editor.getCursor();
        const lineNum = cursor.line;
        const line = editor.getLine(lineNum);

        // Check if current line looks like a table separator
        if (!TABLE_SEP_RE.test(line)) return;

        // Check if previous line is a table header
        if (lineNum === 0) return;
        const prevLine = editor.getLine(lineNum - 1);
        if (!TABLE_HEADER_RE.test(prevLine)) return;

        // Find the end of the table (last pipe-containing line)
        const lastLine = editor.lastLine();
        let tableEnd = lineNum;
        for (let i = lineNum + 1; i <= lastLine; i++) {
            const l = editor.getLine(i);
            if (l.trim().startsWith("|")) {
                tableEnd = i;
            } else {
                break;
            }
        }

        // Check if there's already a caption after the table
        const nextLineNum = tableEnd + 1;
        if (nextLineNum <= lastLine) {
            const nextLine = editor.getLine(nextLineNum);
            if (TABLE_CAPTION_RE.test(nextLine)) return;
        }

        // Generate and insert caption
        const tag = this.generateTag();
        const caption = `: Caption {#tbl:${tag}}`;

        // Delay slightly to not interfere with typing
        setTimeout(() => {
            const insertLine = tableEnd + 1;
            if (insertLine > editor.lastLine()) {
                editor.replaceRange(`\n${caption}`, { line: tableEnd, ch: editor.getLine(tableEnd).length });
            } else {
                editor.replaceRange(`${caption}\n`, { line: insertLine, ch: 0 });
            }
        }, 100);
    }

    private generateTag(): string {
        const template = this.plugin.settings.tblRefStyle;
        const file = this.plugin.app.workspace.getActiveFile();
        const context = JSON.stringify({
            filename: file?.basename ?? "untitled",
            index: 1,
        });
        return this.plugin.bridge.expandTemplate(template, context);
    }
}
