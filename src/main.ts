import { FileSystemAdapter, Plugin } from "obsidian";
import { WasmBridge } from "./bridge";
import { DEFAULT_SETTINGS, PluginSettings } from "./config";
import { createPostProcessor } from "./renderer/reading-mode";
import { createLiveModeExtension } from "./renderer/live-mode";
import { ReferenceSuggest } from "./suggest";
import { ImageEventListener } from "./listeners/image";
import { TableListener } from "./listeners/table";
import { TurboRefSettingTab } from "./settings";

export default class TurboRefPlugin extends Plugin {
    settings: PluginSettings = DEFAULT_SETTINGS;
    bridge: WasmBridge = new WasmBridge();

    async onload() {
        console.log("[TurboRef] Loading plugin...");
        await this.loadSettings();

        // Initialize WASM bridge
        const adapter = this.app.vault.adapter;
        if (adapter instanceof FileSystemAdapter) {
            try {
                await this.bridge.init(this.manifest.dir, adapter);
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

        console.log("[TurboRef] Plugin loaded.");
    }

    onunload() {
        console.log("[TurboRef] Plugin unloaded.");
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
