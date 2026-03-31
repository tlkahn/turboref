import { describe, it, expect } from "vitest";
import { parseBibTeX } from "../parser";

describe("parseBibTeX", () => {
    it("parses a single @article entry", () => {
        const input = `@article{sanderson2009,
  author = {Sanderson, Alexis},
  title = {The Śaiva Age},
  year = {2009}
}`;
        const entries = parseBibTeX(input);
        expect(entries).toHaveLength(1);
        expect(entries[0].key).toBe("sanderson2009");
        expect(entries[0].entryType).toBe("article");
        expect(entries[0].authors).toEqual(["Sanderson, Alexis"]);
        expect(entries[0].title).toBe("The Śaiva Age");
        expect(entries[0].year).toBe("2009");
        expect(entries[0].lineNumber).toBe(0);
    });

    it("parses a @book entry", () => {
        const input = `@book{flood1996,
  author = {Flood, Gavin},
  title = {An Introduction to Hinduism},
  year = {1996},
  publisher = {Cambridge University Press}
}`;
        const entries = parseBibTeX(input);
        expect(entries).toHaveLength(1);
        expect(entries[0].key).toBe("flood1996");
        expect(entries[0].entryType).toBe("book");
        expect(entries[0].authors).toEqual(["Flood, Gavin"]);
        expect(entries[0].year).toBe("1996");
    });

    it("handles double-quote delimited fields", () => {
        const input = `@article{test2020,
  author = "Smith, John",
  title = "A Study of Things",
  year = "2020"
}`;
        const entries = parseBibTeX(input);
        expect(entries).toHaveLength(1);
        expect(entries[0].authors).toEqual(["Smith, John"]);
        expect(entries[0].title).toBe("A Study of Things");
        expect(entries[0].year).toBe("2020");
    });

    it("handles multiple and-separated authors", () => {
        const input = `@article{multi2021,
  author = {First, A. and Second, B. and Third, C.},
  title = {Collaborative Work},
  year = {2021}
}`;
        const entries = parseBibTeX(input);
        expect(entries[0].authors).toEqual(["First, A.", "Second, B.", "Third, C."]);
    });

    it("handles multi-line field values", () => {
        const input = `@article{long2022,
  author = {Author, Long},
  title = {A Very Long Title
    That Spans Multiple Lines},
  year = {2022}
}`;
        const entries = parseBibTeX(input);
        expect(entries[0].title).toBe("A Very Long Title That Spans Multiple Lines");
    });

    it("handles keys with hyphens, dots, and underscores", () => {
        const input = `@article{van-der-berg.2009_a,
  author = {van der Berg, Jan},
  title = {Some Research},
  year = {2009}
}`;
        const entries = parseBibTeX(input);
        expect(entries[0].key).toBe("van-der-berg.2009_a");
    });

    it("parses multiple entries from one file", () => {
        const input = `@article{first2020,
  author = {First, Author},
  title = {Paper One},
  year = {2020}
}

@book{second2021,
  author = {Second, Author},
  title = {Book Two},
  year = {2021}
}`;
        const entries = parseBibTeX(input);
        expect(entries).toHaveLength(2);
        expect(entries[0].key).toBe("first2020");
        expect(entries[1].key).toBe("second2021");
        expect(entries[1].lineNumber).toBe(6);
    });

    it("tracks line number for each entry", () => {
        const input = `
% A comment line

@article{entry1,
  author = {One, Author},
  title = {First},
  year = {2020}
}

@article{entry2,
  author = {Two, Author},
  title = {Second},
  year = {2021}
}`;
        const entries = parseBibTeX(input);
        expect(entries[0].lineNumber).toBe(3);
        expect(entries[1].lineNumber).toBe(9);
    });

    it("handles missing fields gracefully", () => {
        const input = `@article{noauthor2023,
  title = {Orphan Paper},
  year = {2023}
}`;
        const entries = parseBibTeX(input);
        expect(entries).toHaveLength(1);
        expect(entries[0].authors).toEqual([]);
        expect(entries[0].title).toBe("Orphan Paper");
    });

    it("handles entry with no title", () => {
        const input = `@misc{notitle2023,
  author = {Smith, John},
  year = {2023}
}`;
        const entries = parseBibTeX(input);
        expect(entries[0].title).toBe("");
    });

    it("handles entry with no year", () => {
        const input = `@article{noyear,
  author = {Smith, John},
  title = {Timeless}
}`;
        const entries = parseBibTeX(input);
        expect(entries[0].year).toBe("");
    });

    it("ignores @comment entries", () => {
        const input = `@comment{This is a comment}

@article{real2020,
  author = {Real, Author},
  title = {Real Paper},
  year = {2020}
}`;
        const entries = parseBibTeX(input);
        expect(entries).toHaveLength(1);
        expect(entries[0].key).toBe("real2020");
    });

    it("ignores @string entries", () => {
        const input = `@string{cup = {Cambridge University Press}}

@article{real2020,
  author = {Real, Author},
  title = {Real Paper},
  year = {2020}
}`;
        const entries = parseBibTeX(input);
        expect(entries).toHaveLength(1);
    });

    it("ignores @preamble entries", () => {
        const input = `@preamble{"Some LaTeX preamble"}

@article{real2020,
  author = {Real, Author},
  title = {Real Paper},
  year = {2020}
}`;
        const entries = parseBibTeX(input);
        expect(entries).toHaveLength(1);
    });

    it("preserves original key casing", () => {
        const input = `@article{VanDerBerg2009,
  author = {van der Berg, Jan},
  title = {Mixed Case Key},
  year = {2009}
}`;
        const entries = parseBibTeX(input);
        expect(entries[0].key).toBe("VanDerBerg2009");
    });

    it("returns empty array for empty input", () => {
        expect(parseBibTeX("")).toEqual([]);
    });

    it("returns empty array for input with only comments", () => {
        expect(parseBibTeX("% just a comment\n% another")).toEqual([]);
    });

    it("handles nested braces in field values", () => {
        const input = `@article{nested2020,
  author = {Smith, John},
  title = {The {LaTeX} Way of {Formatting}},
  year = {2020}
}`;
        const entries = parseBibTeX(input);
        expect(entries[0].title).toBe("The {LaTeX} Way of {Formatting}");
    });

    it("handles entry type case-insensitively", () => {
        const input = `@Article{case2020,
  author = {Smith, John},
  title = {Case Test},
  year = {2020}
}`;
        const entries = parseBibTeX(input);
        expect(entries[0].entryType).toBe("article");
    });

    it("handles field names case-insensitively", () => {
        const input = `@article{fields2020,
  Author = {Smith, John},
  TITLE = {Field Case Test},
  Year = {2020}
}`;
        const entries = parseBibTeX(input);
        expect(entries[0].authors).toEqual(["Smith, John"]);
        expect(entries[0].title).toBe("Field Case Test");
        expect(entries[0].year).toBe("2020");
    });

    it("handles bare (unquoted, unbraced) numeric year", () => {
        const input = `@article{bare2020,
  author = {Smith, John},
  title = {Bare Year},
  year = 2020
}`;
        const entries = parseBibTeX(input);
        expect(entries[0].year).toBe("2020");
    });
});
