import { FileSystemAdapter } from "obsidian";
import { initSync, expand_template, get_definitions, parse_document, resolve_citations } from "../crates/wasm/pkg/turboref_wasm";

export interface ResolvedCitation {
    char_start: number;
    char_end: number;
    rendered_text: string;
    is_valid: boolean;
    original: string;
}

export interface DefinitionInfo {
    ref_type: string;
    id: string;
    number: string;
    caption: string | null;
    line: number;
    char_offset: number;
}

export class WasmBridge {
    private initialized = false;

    async init(pluginDir: string, adapter: FileSystemAdapter): Promise<void> {
        if (this.initialized) return;

        const wasmPath = `${pluginDir}/turboref_wasm_bg.wasm`;
        const wasmBinary = await adapter.readBinary(wasmPath);
        initSync({ module: wasmBinary });
        this.initialized = true;
        console.log("[TurboRef] WASM initialized successfully");
    }

    private ensureInit(): void {
        if (!this.initialized) {
            throw new Error("[TurboRef] WASM not initialized. Call init() first.");
        }
    }

    resolveCitations(content: string, configJson: string): ResolvedCitation[] {
        this.ensureInit();
        return JSON.parse(resolve_citations(content, configJson));
    }

    getDefinitions(content: string, configJson: string): DefinitionInfo[] {
        this.ensureInit();
        return JSON.parse(get_definitions(content, configJson));
    }

    expandTemplate(template: string, contextJson: string): string {
        this.ensureInit();
        return expand_template(template, contextJson);
    }

    parseDocument(content: string, configJson: string): { definitions: DefinitionInfo[] } {
        this.ensureInit();
        return JSON.parse(parse_document(content, configJson));
    }
}
