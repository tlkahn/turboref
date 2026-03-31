/**
 * Extract the `bibliography` field from frontmatter as an array of paths.
 */
export function extractBibliographyField(
    frontmatter: Record<string, unknown> | undefined
): string[] {
    if (!frontmatter) return [];
    const bib = frontmatter.bibliography;

    if (typeof bib === "string") return [bib];
    if (Array.isArray(bib)) return bib.filter((v): v is string => typeof v === "string");
    return [];
}

/**
 * Resolve bibliography paths relative to the note's directory.
 * Returns vault-relative paths.
 */
export function resolveBibPaths(bibPaths: string[], notePath: string): string[] {
    if (bibPaths.length === 0) return [];

    const noteDir = notePath.includes("/")
        ? notePath.slice(0, notePath.lastIndexOf("/"))
        : "";

    return bibPaths.map((p) => normalizePath(noteDir ? `${noteDir}/${p}` : p));
}

function normalizePath(path: string): string {
    const parts = path.split("/");
    const resolved: string[] = [];

    for (const part of parts) {
        if (part === "..") {
            resolved.pop();
        } else if (part !== "." && part !== "") {
            resolved.push(part);
        }
    }

    return resolved.join("/");
}
