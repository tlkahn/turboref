import { EditorView, WidgetType } from "@codemirror/view";

/**
 * CodeMirror widget for rendering a cross-reference citation inline.
 */
export class CrossrefWidget extends WidgetType {
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
        span.className = `turboref-citation ${this.isValid ? "" : "invalid"}`.trim();
        span.textContent = this.renderedText;
        span.title = this.original;
        span.setAttribute("data-original-ref", this.original);

        const charStart = this.charStart;
        span.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Dispatch after CM6's own event processing settles
            setTimeout(() => {
                view.dispatch({ selection: { anchor: charStart } });
                view.focus();
            }, 0);
        });

        return span;
    }

    eq(other: CrossrefWidget): boolean {
        return (
            this.original === other.original &&
            this.renderedText === other.renderedText &&
            this.isValid === other.isValid &&
            this.charStart === other.charStart &&
            this.charEnd === other.charEnd
        );
    }
}
