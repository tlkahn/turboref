import { Editor, MarkdownView } from "obsidian";
import type TurboRefPlugin from "../main";

const IMAGE_WITH_TAG_RE = /!\[.*?\]\(.*?\)\{#fig:.*?\}/;
const WIKI_IMAGE_RE = /!\[\[(.*?)\]\]/;
const MARKDOWN_IMAGE_RE = /!\[(.*?)\]\((.*?)\)/;

/**
 * Listens for image paste/drop events and auto-adds figure labels.
 */
export class ImageEventListener {
    constructor(private plugin: TurboRefPlugin) {
        this.registerEvents();
    }

    private registerEvents() {
        this.plugin.registerEvent(
            this.plugin.app.workspace.on("editor-paste", (evt, editor, view) => {
                if (!this.plugin.settings.autoAddFigRef) return;
                // Delay to let the paste complete
                setTimeout(() => this.processEditor(editor), 200);
            })
        );

        this.plugin.registerEvent(
            this.plugin.app.workspace.on("editor-drop", (evt, editor, view) => {
                if (!this.plugin.settings.autoAddFigRef) return;
                setTimeout(() => this.processEditor(editor), 200);
            })
        );
    }

    private processEditor(editor: Editor) {
        const cursor = editor.getCursor();
        const line = editor.getLine(cursor.line);

        // Skip if already has a tag
        if (IMAGE_WITH_TAG_RE.test(line)) return;

        // Check for markdown image without tag
        if (MARKDOWN_IMAGE_RE.test(line) && !IMAGE_WITH_TAG_RE.test(line)) {
            this.addFigTag(editor, cursor.line, line);
        }
    }

    private addFigTag(editor: Editor, lineNum: number, line: string) {
        const tag = this.generateTag();
        const newLine = `${line}{#fig:${tag}}`;
        editor.setLine(lineNum, newLine);
    }

    private generateTag(): string {
        const template = this.plugin.settings.figRefStyle;
        const file = this.plugin.app.workspace.getActiveFile();
        const context = JSON.stringify({
            filename: file?.basename ?? "untitled",
            index: 1,
            ext: "png",
        });
        return this.plugin.bridge.expandTemplate(template, context);
    }
}
