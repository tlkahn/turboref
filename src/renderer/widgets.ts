import { WidgetType } from "@codemirror/view";

/**
 * CodeMirror widget for rendering a cross-reference citation inline.
 */
export class CrossrefWidget extends WidgetType {
    constructor(
        private readonly original: string,
        private readonly renderedText: string,
        private readonly isValid: boolean
    ) {
        super();
    }

    toDOM(): HTMLElement {
        const span = document.createElement("span");
        span.className = `turboref-citation ${this.isValid ? "" : "invalid"}`.trim();
        span.textContent = this.renderedText;
        span.title = this.original;
        span.setAttribute("data-original-ref", this.original);
        return span;
    }

    eq(other: CrossrefWidget): boolean {
        return (
            this.original === other.original &&
            this.renderedText === other.renderedText &&
            this.isValid === other.isValid
        );
    }
}
