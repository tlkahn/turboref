import { FileSystemAdapter, Plugin, TFile } from "obsidian";
import { WasmBridge } from "./bridge";
import { DEFAULT_SETTINGS, PluginSettings } from "./config";
import { createPostProcessor } from "./renderer/reading-mode";
import { createLiveModeExtension } from "./renderer/live-mode";
import { ReferenceSuggest } from "./suggest";
import { ImageEventListener } from "./listeners/image";
import { TableListener } from "./listeners/table";
import { TurboRefSettingTab } from "./settings";
import type { BibEntry } from "./bib/types";
import type { BibCache } from "./bib/cache";
import { MemoryBibCache, RedisBibCache } from "./bib/cache";
import { parseBibTeX } from "./bib/parser";
import { renderBibCitations } from "./bib/renderer";
import { extractBibliographyField, resolveBibPaths } from "./bib/resolver";

export default class TurboRefPlugin extends Plugin {
    settings: PluginSettings = DEFAULT_SETTINGS;
    bridge: WasmBridge = new WasmBridge();
    currentBibEntries: BibEntry[] = [];
    bibRenderedForms: Map<string, string> = new Map();
    private bibCache: BibCache = new MemoryBibCache();

    async onload() {
        console.log("[TurboRef] Loading plugin...");
        await this.loadSettings();

        // Initialize WASM bridge
        const adapter = this.app.vault.adapter;
        if (adapter instanceof FileSystemAdapter) {
            try {
                await this.bridge.init(this.manifest.dir!, adapter);
            } catch (e) {
                console.error("[TurboRef] Failed to initialize WASM:", e);
                return;
            }
        } else {
            console.warn("[TurboRef] Not a desktop environment, WASM unavailable.");
            return;
        }

        // Reading-mode renderer
        this.registerMarkdownPostProcessor(createPostProcessor(this));

        // Live editing-mode renderer
        this.registerEditorExtension(createLiveModeExtension(this));

        // Auto-completion for [@... references
        this.registerEditorSuggest(new ReferenceSuggest(this.app, this));

        // Image paste/drop auto-labeling
        new ImageEventListener(this);

        // Table auto-caption
        new TableListener(this).register();

        // Settings tab
        this.addSettingTab(new TurboRefSettingTab(this.app, this));

        // Initialize bib cache
        this.initBibCache();

        // Load bib entries on file open
        this.registerEvent(
            this.app.workspace.on("file-open", (file) => {
                if (file) this.loadBibEntries(file);
            })
        );

        // Reload bib entries when metadata changes (frontmatter edits)
        this.registerEvent(
            this.app.metadataCache.on("changed", (file) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile && file.path === activeFile.path) {
                    this.loadBibEntries(file);
                }
            })
        );

        // Invalidate cache when .bib files are modified
        this.registerEvent(
            this.app.vault.on("modify", (file) => {
                if (file instanceof TFile && file.extension === "bib") {
                    const vaultPath = file.path;
                    this.bibCache.invalidate(vaultPath);
                    // Reload if this bib file is relevant to the current note
                    const activeFile = this.app.workspace.getActiveFile();
                    if (activeFile) this.loadBibEntries(activeFile);
                }
            })
        );

        console.log("[TurboRef] Plugin loaded.");
    }

    onunload() {
        this.bibCache.disconnect();
        console.log("[TurboRef] Plugin unloaded.");
    }

    private initBibCache() {
        if (this.settings.redisEnabled) {
            this.bibCache = new RedisBibCache(this.settings.redisUrl);
        } else {
            this.bibCache = new MemoryBibCache();
        }
    }

    private async loadBibEntries(file: TFile) {
        if (!this.settings.enableCiteprocRendering) {
            this.currentBibEntries = [];
            this.bibRenderedForms.clear();
            return;
        }

        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter;
        const bibPaths = extractBibliographyField(frontmatter);

        if (bibPaths.length === 0) {
            this.currentBibEntries = [];
            this.bibRenderedForms.clear();
            return;
        }

        const resolvedPaths = resolveBibPaths(bibPaths, file.path);
        const allEntries: BibEntry[] = [];

        for (const bibPath of resolvedPaths) {
            const bibFile = this.app.vault.getAbstractFileByPath(bibPath);
            if (!(bibFile instanceof TFile)) continue;

            // Check cache
            const stat = await this.app.vault.adapter.stat(bibPath);
            const mtime = stat?.mtime ?? 0;
            const cached = await this.bibCache.get(bibPath);

            if (cached && cached.mtime >= mtime) {
                allEntries.push(...cached.entries);
                continue;
            }

            // Parse fresh
            try {
                const content = await this.app.vault.cachedRead(bibFile);
                const entries = parseBibTeX(content);
                // Tag entries with their source bib file path
                for (const e of entries) {
                    e.bibFile = bibPath;
                }
                allEntries.push(...entries);
                await this.bibCache.set(bibPath, { entries, mtime });
            } catch (e) {
                console.error(`[TurboRef] Failed to parse ${bibPath}:`, e);
            }
        }

        this.currentBibEntries = allEntries;
        this.bibRenderedForms = renderBibCitations(allEntries);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
