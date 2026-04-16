// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { replaceCiteprocInDom } from "../reading-mode";
import type { BibEntry } from "../../bib/types";

/**
 * Minimal mock of the plugin object for replaceCiteprocInDom.
 * Only the fields actually accessed by the function are included.
 */
function makePlugin(
    bibEntries: BibEntry[],
    renderedForms: Map<string, string>
) {
    return {
        currentBibEntries: bibEntries,
        bibRenderedForms: renderedForms,
        app: {
            vault: {
                adapter: {}, // not FileSystemAdapter — click handlers won't bind
            },
        },
        settings: {
            bibEditorCommand: "code {file}:{line}",
        },
    } as any;
}

const ENTRIES: BibEntry[] = [
    {
        key: "oneil1996lsm",
        authors: ["O'Neil, Patrick"],
        title: "The Log-Structured Merge-Tree",
        year: "1996",
        entryType: "article",
        lineNumber: 1,
        bibFile: "refs.bib",
    },
    {
        key: "smith2020",
        authors: ["Smith, John"],
        title: "A Study",
        year: "2020",
        entryType: "article",
        lineNumber: 20,
        bibFile: "refs.bib",
    },
    {
        key: "jones2021",
        authors: ["Jones, Alice"],
        title: "Another Study",
        year: "2021",
        entryType: "article",
        lineNumber: 40,
        bibFile: "refs.bib",
    },
];

const RENDERED = new Map([
    ["oneil1996lsm", "O'Neil 1996"],
    ["smith2020", "Smith 2020"],
    ["jones2021", "Jones 2021"],
]);

describe("replaceCiteprocInDom — callout structures", () => {
    it("replaces citation inside callout content", () => {
        const el = document.createElement("div");
        el.innerHTML = `
            <div class="callout">
                <div class="callout-title"><div class="callout-title-inner">Important</div></div>
                <div class="callout-content">
                    <p>Nobody has mapped this before. [@oneil1996lsm] (append-only L0)</p>
                </div>
            </div>`;

        const plugin = makePlugin(ENTRIES, RENDERED);
        replaceCiteprocInDom(el, new Set(), plugin, {} as any);

        const span = el.querySelector("span.turboref-citeproc");
        expect(span).not.toBeNull();
        expect(span!.textContent).toBe("O'Neil 1996");
    });

    it("replaces citation inside regular blockquote (regression)", () => {
        const el = document.createElement("div");
        el.innerHTML = `<blockquote><p>See [@smith2020] for details.</p></blockquote>`;

        const plugin = makePlugin(ENTRIES, RENDERED);
        replaceCiteprocInDom(el, new Set(), plugin, {} as any);

        const span = el.querySelector("span.turboref-citeproc");
        expect(span).not.toBeNull();
        expect(span!.textContent).toBe("Smith 2020");
    });

    it("skips crossref citations ([@fig:cat]) while processing citeproc", () => {
        const el = document.createElement("div");
        el.innerHTML = `
            <div class="callout">
                <div class="callout-content">
                    <p>See [@fig:cat] and [@smith2020].</p>
                </div>
            </div>`;

        const plugin = makePlugin(ENTRIES, RENDERED);
        // [@fig:cat] contains ":" so replaceCiteprocInDom skips it internally
        replaceCiteprocInDom(el, new Set(), plugin, {} as any);

        const spans = el.querySelectorAll("span.turboref-citeproc");
        expect(spans.length).toBe(1);
        expect(spans[0].textContent).toBe("Smith 2020");
        // The crossref pattern should remain as text
        expect(el.textContent).toContain("[@fig:cat]");
    });

    it("replaces citation inside nested callout", () => {
        const el = document.createElement("div");
        el.innerHTML = `
            <div class="callout">
                <div class="callout-content">
                    <div class="callout">
                        <div class="callout-content">
                            <p>Nested reference [@jones2021] here.</p>
                        </div>
                    </div>
                </div>
            </div>`;

        const plugin = makePlugin(ENTRIES, RENDERED);
        replaceCiteprocInDom(el, new Set(), plugin, {} as any);

        const span = el.querySelector("span.turboref-citeproc");
        expect(span).not.toBeNull();
        expect(span!.textContent).toBe("Jones 2021");
    });

    it("renders batch citations in callout", () => {
        const el = document.createElement("div");
        el.innerHTML = `
            <div class="callout">
                <div class="callout-content">
                    <p>Multiple sources [@smith2020; @jones2021] agree.</p>
                </div>
            </div>`;

        const plugin = makePlugin(ENTRIES, RENDERED);
        replaceCiteprocInDom(el, new Set(), plugin, {} as any);

        const wrapper = el.querySelector("span.turboref-citeproc");
        expect(wrapper).not.toBeNull();
        const parts = wrapper!.querySelectorAll("span.turboref-citeproc-part");
        expect(parts.length).toBe(2);
        expect(parts[0].textContent).toBe("Smith 2020");
        expect(parts[1].textContent).toBe("Jones 2021");
    });

    it("skips citations already handled by crossref", () => {
        const el = document.createElement("div");
        el.innerHTML = `<p>See [@smith2020] for info.</p>`;

        const plugin = makePlugin(ENTRIES, RENDERED);
        // Simulate crossref already claimed this citation
        const crossrefOriginals = new Set(["[@smith2020]"]);
        replaceCiteprocInDom(el, crossrefOriginals, plugin, {} as any);

        const span = el.querySelector("span.turboref-citeproc");
        expect(span).toBeNull();
        expect(el.textContent).toContain("[@smith2020]");
    });

    it("renders unknown key as raw key text", () => {
        const el = document.createElement("div");
        el.innerHTML = `<p>See [@unknownkey2099] for more.</p>`;

        const plugin = makePlugin(ENTRIES, RENDERED);
        replaceCiteprocInDom(el, new Set(), plugin, {} as any);

        const span = el.querySelector("span.turboref-citeproc-part");
        expect(span).not.toBeNull();
        expect(span!.textContent).toBe("unknownkey2099");
    });
});
