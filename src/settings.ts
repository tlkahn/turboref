import { App, PluginSettingTab, Setting } from "obsidian";
import type TurboRefPlugin from "./main";
import { DEFAULT_SETTINGS } from "./config";

export class TurboRefSettingTab extends PluginSettingTab {
    plugin: TurboRefPlugin;

    constructor(app: App, plugin: TurboRefPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // --- Rendering ---
        containerEl.createEl("h3", { text: "Rendering" });

        new Setting(containerEl)
            .setName("Enable reading mode rendering")
            .setDesc("Render cross-references in reading/preview mode")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableCrossrefRendering)
                    .onChange(async (value) => {
                        this.plugin.settings.enableCrossrefRendering = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Enable live editing rendering")
            .setDesc("Render cross-references inline while editing")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableLiveRendering)
                    .onChange(async (value) => {
                        this.plugin.settings.enableLiveRendering = value;
                        await this.plugin.saveSettings();
                    })
            );

        // --- Auto-labeling ---
        containerEl.createEl("h3", { text: "Auto-labeling" });

        new Setting(containerEl)
            .setName("Auto-add figure labels")
            .setDesc("Automatically add {#fig:id} to pasted/dropped images")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.autoAddFigRef)
                    .onChange(async (value) => {
                        this.plugin.settings.autoAddFigRef = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Auto-add table labels")
            .setDesc("Automatically add caption with {#tbl:id} to new tables")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.autoAddTblRef)
                    .onChange(async (value) => {
                        this.plugin.settings.autoAddTblRef = value;
                        await this.plugin.saveSettings();
                    })
            );

        // --- Label formats ---
        containerEl.createEl("h3", { text: "Label formats" });

        new Setting(containerEl)
            .setName("Figure label format")
            .setDesc("Template for auto-generated figure IDs. Variables: {tag:n}, {filename}, {index}")
            .addText((text) =>
                text
                    .setPlaceholder(DEFAULT_SETTINGS.figRefStyle)
                    .setValue(this.plugin.settings.figRefStyle)
                    .onChange(async (value) => {
                        this.plugin.settings.figRefStyle = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Table label format")
            .addText((text) =>
                text
                    .setPlaceholder(DEFAULT_SETTINGS.tblRefStyle)
                    .setValue(this.plugin.settings.tblRefStyle)
                    .onChange(async (value) => {
                        this.plugin.settings.tblRefStyle = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Equation label format")
            .addText((text) =>
                text
                    .setPlaceholder(DEFAULT_SETTINGS.eqRefStyle)
                    .setValue(this.plugin.settings.eqRefStyle)
                    .onChange(async (value) => {
                        this.plugin.settings.eqRefStyle = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Listing label format")
            .addText((text) =>
                text
                    .setPlaceholder(DEFAULT_SETTINGS.lstRefStyle)
                    .setValue(this.plugin.settings.lstRefStyle)
                    .onChange(async (value) => {
                        this.plugin.settings.lstRefStyle = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Section label format")
            .addText((text) =>
                text
                    .setPlaceholder(DEFAULT_SETTINGS.secRefStyle)
                    .setValue(this.plugin.settings.secRefStyle)
                    .onChange(async (value) => {
                        this.plugin.settings.secRefStyle = value;
                        await this.plugin.saveSettings();
                    })
            );

        // --- Citeproc ---
        containerEl.createEl("h3", { text: "Citeproc (bibliography)" });

        new Setting(containerEl)
            .setName("Enable citeproc rendering")
            .setDesc("Render bibliographic citations from .bib files as 'Author Year'")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableCiteprocRendering)
                    .onChange(async (value) => {
                        this.plugin.settings.enableCiteprocRendering = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Bib editor command")
            .setDesc("Command to open .bib files at a line. Use {file} and {line} placeholders. Examples: subl {file}:{line}, code -g {file}:{line}, emacsclient +{line} {file}")
            .addText((text) =>
                text
                    .setPlaceholder(DEFAULT_SETTINGS.bibEditorCommand)
                    .setValue(this.plugin.settings.bibEditorCommand)
                    .onChange(async (value) => {
                        this.plugin.settings.bibEditorCommand = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Enable Redis cache")
            .setDesc("Cache parsed .bib entries in Redis for persistence across restarts")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.redisEnabled)
                    .onChange(async (value) => {
                        this.plugin.settings.redisEnabled = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Redis URL")
            .setDesc("Redis connection URL (only used when Redis cache is enabled)")
            .addText((text) =>
                text
                    .setPlaceholder("redis://localhost:6379")
                    .setValue(this.plugin.settings.redisUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.redisUrl = value;
                        await this.plugin.saveSettings();
                    })
            );

        // --- Pandoc-crossref ---
        containerEl.createEl("h3", { text: "Pandoc-crossref" });

        new Setting(containerEl)
            .setName("Figure title")
            .setDesc("Caption prefix for figures (e.g., Figure, 图)")
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.figureTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.figureTitle = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Table title")
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.tableTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.tableTitle = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Equation title")
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.equationTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.equationTitle = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Listing title")
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.listingTitle)
                    .onChange(async (value) => {
                        this.plugin.settings.listingTitle = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Link references")
            .setDesc("Create hyperlinks from references to definitions")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.linkReferences)
                    .onChange(async (value) => {
                        this.plugin.settings.linkReferences = value;
                        await this.plugin.saveSettings();
                    })
            );
    }
}
