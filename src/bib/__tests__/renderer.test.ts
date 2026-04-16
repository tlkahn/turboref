import { describe, it, expect } from "vitest";
import { renderBibCitation, renderBibCitations, renderBibCitationYearOnly, parseCiteprocKeys } from "../renderer";
import type { BibEntry } from "../types";

function entry(overrides: Partial<BibEntry> & { key: string }): BibEntry {
    return {
        authors: [],
        title: "",
        year: "",
        entryType: "article",
        lineNumber: 0,
        ...overrides,
    };
}

describe("renderBibCitation (single entry, no disambiguation)", () => {
    it("renders single author with year", () => {
        const e = entry({ key: "s2009", authors: ["Sanderson, Alexis"], year: "2009" });
        expect(renderBibCitation(e)).toBe("Sanderson 2009");
    });

    it("renders two authors with &", () => {
        const e = entry({ key: "sj2009", authors: ["Sanderson, Alexis", "Jordan, Robert"], year: "2009" });
        expect(renderBibCitation(e)).toBe("Sanderson & Jordan 2009");
    });

    it("renders three+ authors with et al.", () => {
        const e = entry({
            key: "m2021",
            authors: ["First, A.", "Second, B.", "Third, C."],
            year: "2021",
        });
        expect(renderBibCitation(e)).toBe("First et al. 2021");
    });

    it("extracts last name from 'First Last' format", () => {
        const e = entry({ key: "s2020", authors: ["John Smith"], year: "2020" });
        expect(renderBibCitation(e)).toBe("Smith 2020");
    });

    it("extracts last name from 'Last, First' format", () => {
        const e = entry({ key: "s2020", authors: ["Smith, John"], year: "2020" });
        expect(renderBibCitation(e)).toBe("Smith 2020");
    });

    it("falls back to raw key when no author", () => {
        const e = entry({ key: "anon2023", year: "2023" });
        expect(renderBibCitation(e)).toBe("anon2023");
    });

    it("renders n.d. when no year", () => {
        const e = entry({ key: "s", authors: ["Smith, John"] });
        expect(renderBibCitation(e)).toBe("Smith n.d.");
    });

    it("falls back to raw key when no author and no year", () => {
        const e = entry({ key: "mystery" });
        expect(renderBibCitation(e)).toBe("mystery");
    });
});

describe("renderBibCitationYearOnly (author-suppressed)", () => {
    it("returns year when present", () => {
        const e = entry({ key: "bush1945", authors: ["Bush, Vannevar"], year: "1945" });
        expect(renderBibCitationYearOnly(e)).toBe("1945");
    });

    it("returns n.d. when year is empty", () => {
        const e = entry({ key: "noyr", authors: ["Smith, John"], year: "" });
        expect(renderBibCitationYearOnly(e)).toBe("n.d.");
    });

    it("ignores author completely", () => {
        const e = entry({ key: "multi", authors: ["A, B", "C, D", "E, F"], year: "2020" });
        expect(renderBibCitationYearOnly(e)).toBe("2020");
    });
});

describe("parseCiteprocKeys", () => {
    it("parses single key without locator", () => {
        expect(parseCiteprocKeys("@newman2018")).toEqual([
            { key: "newman2018", suppress: false, locator: "" },
        ]);
    });

    it("parses single key with chapter locator", () => {
        expect(parseCiteprocKeys("@newman2018networks, ch. 11")).toEqual([
            { key: "newman2018networks", suppress: false, locator: "ch. 11" },
        ]);
    });

    it("parses suppressed key with locator", () => {
        expect(parseCiteprocKeys("-@bush1945, ch. 5")).toEqual([
            { key: "bush1945", suppress: true, locator: "ch. 5" },
        ]);
    });

    it("parses batch with mixed locators", () => {
        expect(parseCiteprocKeys("@smith2020, ch. 3; @jones2021")).toEqual([
            { key: "smith2020", suppress: false, locator: "ch. 3" },
            { key: "jones2021", suppress: false, locator: "" },
        ]);
    });

    it("parses page locator", () => {
        expect(parseCiteprocKeys("@smith2020, pp. 45-50")).toEqual([
            { key: "smith2020", suppress: false, locator: "pp. 45-50" },
        ]);
    });

    it("parses batch with all keys having locators", () => {
        expect(parseCiteprocKeys("@smith2020, ch. 3; -@jones2021, pp. 10")).toEqual([
            { key: "smith2020", suppress: false, locator: "ch. 3" },
            { key: "jones2021", suppress: true, locator: "pp. 10" },
        ]);
    });

    it("parses suppressed key without locator", () => {
        expect(parseCiteprocKeys("-@bush1945")).toEqual([
            { key: "bush1945", suppress: true, locator: "" },
        ]);
    });
});

describe("renderBibCitations (disambiguation)", () => {
    it("adds letter suffix for same author+year", () => {
        const entries = [
            entry({ key: "sanderson2009a", authors: ["Sanderson, Alexis"], year: "2009" }),
            entry({ key: "sanderson2009b", authors: ["Sanderson, Alexis"], year: "2009" }),
        ];
        const result = renderBibCitations(entries);
        expect(result.get("sanderson2009a")).toBe("Sanderson 2009a");
        expect(result.get("sanderson2009b")).toBe("Sanderson 2009b");
    });

    it("orders disambiguation letters alphabetically by cite key", () => {
        const entries = [
            entry({ key: "z_key", authors: ["Smith, John"], year: "2020" }),
            entry({ key: "a_key", authors: ["Smith, John"], year: "2020" }),
        ];
        const result = renderBibCitations(entries);
        expect(result.get("a_key")).toBe("Smith 2020a");
        expect(result.get("z_key")).toBe("Smith 2020b");
    });

    it("handles three+ entries with same author+year", () => {
        const entries = [
            entry({ key: "s2020a", authors: ["Smith, John"], year: "2020" }),
            entry({ key: "s2020b", authors: ["Smith, John"], year: "2020" }),
            entry({ key: "s2020c", authors: ["Smith, John"], year: "2020" }),
        ];
        const result = renderBibCitations(entries);
        expect(result.get("s2020a")).toBe("Smith 2020a");
        expect(result.get("s2020b")).toBe("Smith 2020b");
        expect(result.get("s2020c")).toBe("Smith 2020c");
    });

    it("does not add suffix when author+year is unique", () => {
        const entries = [
            entry({ key: "s2020", authors: ["Smith, John"], year: "2020" }),
            entry({ key: "j2021", authors: ["Jones, Alice"], year: "2021" }),
        ];
        const result = renderBibCitations(entries);
        expect(result.get("s2020")).toBe("Smith 2020");
        expect(result.get("j2021")).toBe("Jones 2021");
    });

    it("handles mixed disambiguation and unique entries", () => {
        const entries = [
            entry({ key: "s2020a", authors: ["Smith, John"], year: "2020" }),
            entry({ key: "s2020b", authors: ["Smith, John"], year: "2020" }),
            entry({ key: "j2021", authors: ["Jones, Alice"], year: "2021" }),
        ];
        const result = renderBibCitations(entries);
        expect(result.get("s2020a")).toBe("Smith 2020a");
        expect(result.get("s2020b")).toBe("Smith 2020b");
        expect(result.get("j2021")).toBe("Jones 2021");
    });
});
