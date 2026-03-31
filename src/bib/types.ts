export interface BibEntry {
    key: string;
    authors: string[];
    title: string;
    year: string;
    entryType: string;
    lineNumber: number;
    bibFile?: string;
}
