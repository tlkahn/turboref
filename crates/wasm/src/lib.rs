use wasm_bindgen::prelude::*;
use turboref_core::config::DocumentConfig;
use turboref_core::document::Document;
use turboref_core::template;

#[wasm_bindgen]
pub fn parse_document(content: &str, config_json: &str) -> String {
    let config: DocumentConfig =
        serde_json::from_str(config_json).unwrap_or_default();
    let doc = Document::parse(content, config);

    #[derive(serde::Serialize)]
    struct ParseResult<'a> {
        definitions: &'a [turboref_core::types::Definition],
    }

    let result = ParseResult {
        definitions: doc.get_definitions(),
    };
    serde_json::to_string(&result).unwrap_or_default()
}

#[wasm_bindgen]
pub fn resolve_citations(content: &str, config_json: &str) -> String {
    let config: DocumentConfig =
        serde_json::from_str(config_json).unwrap_or_default();
    let doc = Document::parse(content, config);
    let resolved = doc.resolve_all();
    serde_json::to_string(&resolved).unwrap_or_default()
}

#[wasm_bindgen]
pub fn get_definitions(content: &str, config_json: &str) -> String {
    let config: DocumentConfig =
        serde_json::from_str(config_json).unwrap_or_default();
    let doc = Document::parse(content, config);
    serde_json::to_string(doc.get_definitions()).unwrap_or_default()
}

#[wasm_bindgen]
pub fn expand_template(tmpl: &str, context_json: &str) -> String {
    let ctx: template::TemplateContext =
        serde_json::from_str(context_json).unwrap_or_default();
    template::expand(tmpl, &ctx)
}
