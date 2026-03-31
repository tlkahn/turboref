import { describe, it, expect } from "vitest";
import { resolveBibPaths, extractBibliographyField } from "../resolver";

describe("extractBibliographyField", () => {
    it("extracts single string bibliography path", () => {
        const frontmatter = { bibliography: "refs.bib" };
        expect(extractBibliographyField(frontmatter)).toEqual(["refs.bib"]);
    });

    it("extracts array of bibliography paths", () => {
        const frontmatter = { bibliography: ["a.bib", "b.bib"] };
        expect(extractBibliographyField(frontmatter)).toEqual(["a.bib", "b.bib"]);
    });

    it("returns empty array when no bibliography field", () => {
        expect(extractBibliographyField({})).toEqual([]);
        expect(extractBibliographyField(undefined)).toEqual([]);
    });

    it("returns empty array for non-string/array values", () => {
        expect(extractBibliographyField({ bibliography: 42 })).toEqual([]);
        expect(extractBibliographyField({ bibliography: null })).toEqual([]);
    });
});

describe("resolveBibPaths", () => {
    it("resolves relative path from note directory", () => {
        const result = resolveBibPaths(["refs.bib"], "papers/notes/my-note.md");
        expect(result).toEqual(["papers/notes/refs.bib"]);
    });

    it("resolves path when note is at vault root", () => {
        const result = resolveBibPaths(["refs.bib"], "my-note.md");
        expect(result).toEqual(["refs.bib"]);
    });

    it("resolves multiple paths", () => {
        const result = resolveBibPaths(["a.bib", "b.bib"], "dir/note.md");
        expect(result).toEqual(["dir/a.bib", "dir/b.bib"]);
    });

    it("handles paths with subdirectories", () => {
        const result = resolveBibPaths(["../shared/refs.bib"], "papers/note.md");
        expect(result).toEqual(["shared/refs.bib"]);
    });

    it("returns empty array for empty input", () => {
        expect(resolveBibPaths([], "note.md")).toEqual([]);
    });
});
