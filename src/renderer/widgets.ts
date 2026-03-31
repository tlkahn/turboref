import { EditorView, WidgetType } from "@codemirror/view";
import { App, Notice } from "obsidian";

/**
 * Highlight a line at the given position with a blink animation.
 */
export function highlightLine(view: EditorView, pos: number): void {
    try {
        const line = view.state.doc.lineAt(pos);
        const domPos = view.domAtPos(line.from);
        const cmLine = (domPos.node as HTMLElement).closest?.(".cm-line")
            ?? (domPos.node.parentElement)?.closest(".cm-line");
        if (cmLine) {
            cmLine.classList.add("turboref-highlight-blink");
            setTimeout(() => cmLine.classList.remove("turboref-highlight-blink"), 1500);
        }
    } catch {
        // Position may be out of viewport; ignore
    }
}

/**
 * CodeMirror widget for rendering a cross-reference citation inline.
 * Mouse click navigates to the definition; arrow keys expand in-place.
 */
export class CrossrefWidget extends WidgetType {
    constructor(
        private readonly original: string,
        private readonly renderedText: string,
        private readonly isValid: boolean,
        private readonly charStart: number,
        private readonly charEnd: number,
        private readonly targetCharOffset: number | null = null
    ) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement("span");
        span.className = `turboref-citation ${this.isValid ? "" : "invalid"}`.trim();
        span.textContent = this.renderedText;
        span.title = this.original;
        span.setAttribute("data-original-ref", this.original);

        const targetOffset = this.targetCharOffset;
        span.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            setTimeout(() => {
                if (targetOffset != null) {
                    // Navigate to definition
                    view.dispatch({
                        selection: { anchor: targetOffset },
                        scrollIntoView: true,
                    });
                    view.focus();
                    // Highlight the target line after scroll settles
                    requestAnimationFrame(() => highlightLine(view, targetOffset));
                } else {
                    // Fallback: place cursor at citation
                    view.dispatch({ selection: { anchor: this.charStart } });
                    view.focus();
                }
            }, 0);
        });

        if (targetOffset != null) {
            span.style.cursor = "pointer";
        }

        return span;
    }

    eq(other: CrossrefWidget): boolean {
        return (
            this.original === other.original &&
            this.renderedText === other.renderedText &&
            this.isValid === other.isValid &&
            this.charStart === other.charStart &&
            this.charEnd === other.charEnd &&
            this.targetCharOffset === other.targetCharOffset
        );
    }
}

/**
 * CodeMirror widget for rendering a definition tag inline.
 * Click places cursor at the tag (it's already at the definition).
 */
export class DefinitionWidget extends WidgetType {
    constructor(
        private readonly original: string,
        private readonly renderedText: string,
        private readonly isValid: boolean,
        private readonly charStart: number,
        private readonly charEnd: number
    ) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement("span");
        span.className = `turboref-definition ${this.isValid ? "" : "invalid"}`.trim();
        span.textContent = this.renderedText;
        span.title = this.original;
        span.setAttribute("data-original-ref", this.original);

        const charStart = this.charStart;
        span.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            setTimeout(() => {
                view.dispatch({ selection: { anchor: charStart } });
                view.focus();
            }, 0);
        });

        return span;
    }

    eq(other: DefinitionWidget): boolean {
        return (
            this.original === other.original &&
            this.renderedText === other.renderedText &&
            this.isValid === other.isValid &&
            this.charStart === other.charStart &&
            this.charEnd === other.charEnd
        );
    }
}

/**
 * CodeMirror widget for rendering a citeproc (bibliographic) citation inline.
 * Click opens the .bib file in the system default application.
 */
export class CiteprocWidget extends WidgetType {
    constructor(
        private readonly original: string,
        private readonly renderedText: string,
        private readonly charStart: number,
        private readonly charEnd: number,
        private readonly bibFilePath: string,
        private readonly lineNumber: number,
        private readonly app: App
    ) {
        super();
    }

    toDOM(view: EditorView): HTMLElement {
        const span = document.createElement("span");
        span.className = "turboref-citeproc";
        span.textContent = this.renderedText;
        span.title = this.original;
        span.setAttribute("data-original-ref", this.original);
        span.style.cursor = "pointer";

        span.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            setTimeout(() => {
                (this.app as any).openWithDefaultApp(this.bibFilePath);
                new Notice(`Opened ${this.bibFilePath} — entry at line ${this.lineNumber + 1}`);
            }, 0);
        });

        return span;
    }

    eq(other: CiteprocWidget): boolean {
        return (
            this.original === other.original &&
            this.renderedText === other.renderedText &&
            this.charStart === other.charStart &&
            this.charEnd === other.charEnd &&
            this.bibFilePath === other.bibFilePath
        );
    }
}
