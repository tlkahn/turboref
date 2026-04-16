import type { BibEntry } from "./types";

/**
 * Render a single bib citation as "Author Year" (no disambiguation).
 */
export function renderBibCitation(entry: BibEntry): string {
    const lastName = extractLastName(entry.authors);
    if (!lastName) return entry.key;
    if (!entry.year) return `${lastName} n.d.`;
    return `${lastName} ${entry.year}`;
}

/**
 * Render all bib citations with disambiguation suffixes where needed.
 * Returns a Map from cite key to rendered text.
 */
export function renderBibCitations(entries: BibEntry[]): Map<string, string> {
    const result = new Map<string, string>();

    // Group entries by their base rendered form (Author Year)
    const groups = new Map<string, BibEntry[]>();
    for (const e of entries) {
        const base = renderBibCitation(e);
        const group = groups.get(base) ?? [];
        group.push(e);
        groups.set(base, group);
    }

    for (const [base, group] of groups) {
        if (group.length === 1) {
            result.set(group[0].key, base);
        } else {
            // Sort alphabetically by cite key for deterministic letter assignment
            group.sort((a, b) => a.key.localeCompare(b.key));
            for (let i = 0; i < group.length; i++) {
                const suffix = String.fromCharCode(97 + i); // 'a', 'b', 'c', ...
                result.set(group[i].key, `${base}${suffix}`);
            }
        }
    }

    return result;
}

/**
 * Render a bib citation with author suppressed — year only (for [-@key] syntax).
 */
export function renderBibCitationYearOnly(entry: BibEntry): string {
    return entry.year || "n.d.";
}

export interface CiteprocKeyPart {
    key: string;
    suppress: boolean;
    locator: string;
}

/**
 * Parse the inner text of a citeproc citation (between [ and ]).
 * Handles locator suffixes like `, ch. 11` or `, pp. 45-50`.
 */
export function parseCiteprocKeys(inner: string): CiteprocKeyPart[] {
    return inner.split(/\s*;\s*/).map((k) => {
        const suppress = k.startsWith("-");
        const stripped = k.replace(/^-?@?/, "");
        const commaIdx = stripped.indexOf(",");
        if (commaIdx >= 0) {
            return {
                key: stripped.slice(0, commaIdx).trim(),
                suppress,
                locator: stripped.slice(commaIdx + 1).trim(),
            };
        }
        return { key: stripped.trim(), suppress, locator: "" };
    });
}

function extractLastName(authors: string[]): string | null {
    if (authors.length === 0) return null;

    const first = getLastName(authors[0]);
    if (authors.length === 1) return first;
    if (authors.length === 2) return `${first} & ${getLastName(authors[1])}`;
    return `${first} et al.`;
}

function getLastName(author: string): string {
    const trimmed = author.trim();
    if (trimmed.includes(",")) {
        // "Last, First" format
        return trimmed.split(",")[0].trim();
    }
    // "First Last" format — last word is the last name
    const parts = trimmed.split(/\s+/);
    return parts[parts.length - 1];
}
