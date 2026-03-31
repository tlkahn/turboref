import type { BibEntry } from "./types";

const SKIP_TYPES = new Set(["comment", "string", "preamble"]);

export function parseBibTeX(input: string): BibEntry[] {
    const entries: BibEntry[] = [];
    const lines = input.split("\n");
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const match = line.match(/^\s*@(\w+)\s*\{(.+)/);
        if (!match) {
            i++;
            continue;
        }

        const entryType = match[1].toLowerCase();
        if (SKIP_TYPES.has(entryType)) {
            // Skip until we find the closing brace
            let depth = 0;
            for (let j = match.index! + match[0].indexOf("{"); j < line.length; j++) {
                if (line[j] === "{") depth++;
                else if (line[j] === "}") depth--;
                if (depth === 0) break;
            }
            if (depth > 0) {
                // Multi-line skip entry — find closing brace
                i++;
                while (i < lines.length && depth > 0) {
                    for (const ch of lines[i]) {
                        if (ch === "{") depth++;
                        else if (ch === "}") depth--;
                        if (depth === 0) break;
                    }
                    i++;
                }
            } else {
                i++;
            }
            continue;
        }

        const rest = match[2];
        const commaIdx = rest.indexOf(",");
        if (commaIdx === -1) {
            i++;
            continue;
        }

        const key = rest.slice(0, commaIdx).trim();
        const entryStartLine = i;

        // Collect the full entry body by tracking brace depth
        let depth = 1; // We've seen the opening { of the entry
        let bodyLines = [rest.slice(commaIdx + 1)];
        i++;

        while (i < lines.length && depth > 0) {
            const l = lines[i];
            for (const ch of l) {
                if (ch === "{") depth++;
                else if (ch === "}") depth--;
                if (depth === 0) break;
            }
            if (depth > 0) {
                bodyLines.push(l);
            } else {
                // Include the part of the line before the closing brace
                const closingIdx = findClosingBrace(l, depth + 1);
                if (closingIdx > 0) {
                    bodyLines.push(l.slice(0, closingIdx));
                }
            }
            i++;
        }

        const fields = parseFields(bodyLines.join("\n"));

        const authors = fields.author
            ? fields.author.split(/\s+and\s+/).map((a) => a.trim())
            : [];

        entries.push({
            key,
            entryType,
            authors,
            title: fields.title ?? "",
            year: fields.year ?? "",
            lineNumber: entryStartLine,
        });
    }

    return entries;
}

function findClosingBrace(line: string, startDepth: number): number {
    let depth = startDepth;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === "{") depth++;
        else if (line[i] === "}") depth--;
        if (depth === 0) return i;
    }
    return -1;
}

function parseFields(body: string): Record<string, string> {
    const fields: Record<string, string> = {};
    // Match field = value patterns
    const fieldRe = /(\w+)\s*=\s*/g;
    let match;

    while ((match = fieldRe.exec(body)) !== null) {
        const fieldName = match[1].toLowerCase();
        const valueStart = match.index + match[0].length;
        const value = extractFieldValue(body, valueStart);
        if (value !== null) {
            fields[fieldName] = value.text;
            // Advance past the extracted value
            fieldRe.lastIndex = value.end;
        }
    }

    return fields;
}

function extractFieldValue(
    body: string,
    start: number
): { text: string; end: number } | null {
    let i = start;
    // Skip whitespace
    while (i < body.length && /\s/.test(body[i])) i++;

    if (i >= body.length) return null;

    const ch = body[i];

    if (ch === "{") {
        // Brace-delimited value
        return extractBraced(body, i);
    } else if (ch === '"') {
        // Quote-delimited value
        return extractQuoted(body, i);
    } else {
        // Bare value (e.g., year = 2020)
        const endMatch = body.slice(i).match(/^([^,}\s]+)/);
        if (endMatch) {
            return {
                text: endMatch[1].trim(),
                end: i + endMatch[1].length,
            };
        }
        return null;
    }
}

function extractBraced(
    body: string,
    start: number
): { text: string; end: number } | null {
    let depth = 0;
    let i = start;
    const chars: string[] = [];

    while (i < body.length) {
        if (body[i] === "{") {
            depth++;
            if (depth > 1) chars.push("{");
        } else if (body[i] === "}") {
            depth--;
            if (depth === 0) {
                return {
                    text: normalizeWhitespace(chars.join("")),
                    end: i + 1,
                };
            }
            chars.push("}");
        } else {
            chars.push(body[i]);
        }
        i++;
    }
    return null;
}

function extractQuoted(
    body: string,
    start: number
): { text: string; end: number } | null {
    let i = start + 1; // skip opening quote
    const chars: string[] = [];

    while (i < body.length) {
        if (body[i] === '"' && body[i - 1] !== "\\") {
            return {
                text: normalizeWhitespace(chars.join("")),
                end: i + 1,
            };
        }
        chars.push(body[i]);
        i++;
    }
    return null;
}

function normalizeWhitespace(s: string): string {
    return s.replace(/\s+/g, " ").trim();
}
