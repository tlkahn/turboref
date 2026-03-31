export interface PluginSettings {
    // Reference style templates for auto-ID generation
    figRefStyle: string;
    tblRefStyle: string;
    eqRefStyle: string;
    lstRefStyle: string;
    secRefStyle: string;

    // Auto-add toggles
    autoAddFigRef: boolean;
    autoAddTblRef: boolean;
    autoAddEqRef: boolean;

    // Rendering toggles
    enableCrossrefRendering: boolean;
    enableLiveRendering: boolean;

    // Caption/citation prefixes
    figureTitle: string;
    tableTitle: string;
    listingTitle: string;
    equationTitle: string;
    figPrefix: string[];
    tblPrefix: string[];
    eqPrefix: string[];
    lstPrefix: string[];
    secPrefix: string[];

    // Pandoc options
    linkReferences: boolean;
    nameInLink: boolean;
    subfigGrid: boolean;

    // Citeproc settings
    enableCiteprocRendering: boolean;
    bibEditorCommand: string;
    redisEnabled: boolean;
    redisUrl: string;

    // Image settings
    saveImageNameFormat: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
    figRefStyle: "fig{tag:3}",
    tblRefStyle: "tbl{tag:3}",
    eqRefStyle: "eq{tag:3}",
    lstRefStyle: "lst{tag:3}",
    secRefStyle: "sec{tag:3}",

    autoAddFigRef: true,
    autoAddTblRef: true,
    autoAddEqRef: false,

    enableCrossrefRendering: true,
    enableLiveRendering: true,

    figureTitle: "Figure",
    tableTitle: "Table",
    listingTitle: "Listing",
    equationTitle: "Equation",
    figPrefix: ["Fig.", "Figs."],
    tblPrefix: ["Table", "Tables"],
    eqPrefix: ["Eq.", "Eqs."],
    lstPrefix: ["Listing", "Listings"],
    secPrefix: ["Section", "Sections"],

    linkReferences: false,
    nameInLink: false,
    subfigGrid: false,

    enableCiteprocRendering: true,
    bibEditorCommand: "subl {file}:{line}",
    redisEnabled: false,
    redisUrl: "redis://localhost:6379",

    saveImageNameFormat: "{filename}-{index}.{ext}",
};

/**
 * Build document config JSON for WASM from plugin settings and frontmatter.
 * Frontmatter values take precedence over plugin settings.
 */
export function buildDocumentConfigJson(
    settings: PluginSettings,
    frontmatter?: Record<string, unknown>
): string {
    const locale = navigator.language?.startsWith("zh") ? "zh" : "en";

    const config = {
        locale,
        figure_title: (frontmatter?.figureTitle as string) ?? settings.figureTitle,
        table_title: (frontmatter?.tableTitle as string) ?? settings.tableTitle,
        listing_title: (frontmatter?.listingTitle as string) ?? settings.listingTitle,
        equation_title: (frontmatter?.equationTitle as string) ?? settings.equationTitle,
        fig_prefix: (frontmatter?.figPrefix as string[]) ?? settings.figPrefix,
        tbl_prefix: (frontmatter?.tblPrefix as string[]) ?? settings.tblPrefix,
        eq_prefix: (frontmatter?.eqPrefix as string[]) ?? settings.eqPrefix,
        lst_prefix: (frontmatter?.lstPrefix as string[]) ?? settings.lstPrefix,
        sec_prefix: (frontmatter?.secPrefix as string[]) ?? settings.secPrefix,
        link_references: (frontmatter?.linkReferences as boolean) ?? settings.linkReferences,
        name_in_link: (frontmatter?.nameInLink as boolean) ?? settings.nameInLink,
        subfig_grid: (frontmatter?.subfigGrid as boolean) ?? settings.subfigGrid,
    };

    return JSON.stringify(config);
}
