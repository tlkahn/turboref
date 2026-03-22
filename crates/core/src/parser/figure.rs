use regex::Regex;
use std::sync::LazyLock;

use crate::config::DocumentConfig;
use crate::types::{Definition, RefNumber, RefType};
use super::{Counters, DefinitionParser, PendingFigure};
use super::scan::ScanContext;

// Same-line: ![desc](src){#fig:id} or ![desc](src) {#fig:id}
static IMAGE_WITH_TAG_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"!\[(.*?)\]\((.*?)\)\s*\{#fig:([^}]+)\}").unwrap()
});

// Image without inline tag (no {#fig:...} on the line)
static IMAGE_NO_TAG_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^!\[(.*?)\]\((.*?)\)\s*$").unwrap()
});

// Next-line standalone tag: {#fig:id}
static FIG_TAG_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\s*\{#fig:([^}]+)\}\s*$").unwrap()
});

static SUBFIG_OPEN_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"<div\s+id="fig:([^"]+)">"#).unwrap()
});

pub struct FigureParser;

impl FigureParser {
    /// Extract the main caption from accumulated sub-figure lines.
    /// Scans backwards for the last non-empty, non-image, non-div line.
    fn extract_subfig_caption(lines: &[String]) -> Option<String> {
        for line in lines.iter().rev() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if IMAGE_WITH_TAG_RE.is_match(trimmed) {
                continue;
            }
            if trimmed.starts_with("<div") || trimmed.starts_with("</div") {
                continue;
            }
            return Some(trimmed.to_string());
        }
        None
    }
}

impl DefinitionParser for FigureParser {
    fn ref_type(&self) -> RefType {
        RefType::Fig
    }

    fn prefix_str(&self) -> &str {
        "fig"
    }

    fn on_line(
        &self,
        line: &str,
        line_idx: usize,
        char_offset: usize,
        ctx: &ScanContext,
        counters: &mut Counters,
        _config: &DocumentConfig,
    ) -> Vec<Definition> {
        // Skip inside code or math blocks
        if ctx.in_code_block || ctx.in_math_block {
            counters.pending_fig = PendingFigure::default();
            return Vec::new();
        }

        let trimmed = line.trim();
        let mut defs = Vec::new();

        // 0. Check if previous line had a pending image and this line has {#fig:id}
        if counters.pending_fig.active {
            let pending = std::mem::take(&mut counters.pending_fig);
            if let Some(caps) = FIG_TAG_RE.captures(trimmed) {
                let id = caps[1].trim().to_string();

                if counters.sub_fig.active {
                    counters.sub_fig.current_count += 1;
                    let letter = (b'a' + (counters.sub_fig.current_count - 1) as u8) as char;
                    defs.push(Definition {
                        ref_type: RefType::Fig,
                        id,
                        number: RefNumber::SubNumbered(counters.sub_fig.main_number, letter),
                        caption: Some(pending.description),
                        line: pending.line,
                        char_offset: pending.char_offset,
                    });
                } else {
                    counters.fig_count += 1;
                    defs.push(Definition {
                        ref_type: RefType::Fig,
                        id,
                        number: RefNumber::Simple(counters.fig_count),
                        caption: Some(pending.description),
                        line: pending.line,
                        char_offset: pending.char_offset,
                    });
                }
                return defs;
            }
            // No tag on this line — pending image had no definition, move on
        }

        // 1. Check for sub-figure block open: <div id="fig:...">
        if let Some(caps) = SUBFIG_OPEN_RE.captures(trimmed) {
            let main_id = caps[1].to_string();
            counters.fig_count += 1;
            counters.sub_fig = super::SubFigState {
                active: true,
                main_id,
                main_number: counters.fig_count,
                current_count: 0,
                accumulated_lines: Vec::new(),
            };
            return defs;
        }

        // 2. Check for sub-figure block close: </div>
        if trimmed == "</div>" && counters.sub_fig.active {
            let caption = Self::extract_subfig_caption(&counters.sub_fig.accumulated_lines);
            let main_def = Definition {
                ref_type: RefType::Fig,
                id: counters.sub_fig.main_id.clone(),
                number: RefNumber::Simple(counters.sub_fig.main_number),
                caption,
                line: line_idx,
                char_offset,
            };
            defs.push(main_def);
            counters.sub_fig = super::SubFigState::default();
            return defs;
        }

        // 3. Accumulate lines inside sub-figure block
        if counters.sub_fig.active {
            counters.sub_fig.accumulated_lines.push(line.to_string());
        }

        // 4. Check for image with inline tag: ![desc](src){#fig:id}
        if let Some(caps) = IMAGE_WITH_TAG_RE.captures(line) {
            let description = caps[1].to_string();
            let id = caps[3].to_string();

            if counters.sub_fig.active {
                counters.sub_fig.current_count += 1;
                let letter = (b'a' + (counters.sub_fig.current_count - 1) as u8) as char;
                defs.push(Definition {
                    ref_type: RefType::Fig,
                    id,
                    number: RefNumber::SubNumbered(counters.sub_fig.main_number, letter),
                    caption: Some(description),
                    line: line_idx,
                    char_offset,
                });
            } else {
                counters.fig_count += 1;
                defs.push(Definition {
                    ref_type: RefType::Fig,
                    id,
                    number: RefNumber::Simple(counters.fig_count),
                    caption: Some(description),
                    line: line_idx,
                    char_offset,
                });
            }
            return defs;
        }

        // 5. Image without tag — store as pending for next-line tag check
        if let Some(caps) = IMAGE_NO_TAG_RE.captures(line) {
            let description = caps[1].to_string();
            counters.pending_fig = PendingFigure {
                active: true,
                description,
                line: line_idx,
                char_offset,
            };
        }

        defs
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::scan::scan_document;
    use crate::parser::ParserRegistry;

    /// Helper: parse content with only the FigureParser and return definitions.
    fn parse_figures(content: &str) -> Vec<Definition> {
        let config = DocumentConfig::default();
        let mut registry = ParserRegistry::new();
        registry.register(Box::new(FigureParser));
        scan_document(content, &config, &registry)
    }

    #[test]
    fn parse_standalone_figure() {
        let defs = parse_figures("![A cat](cat.png){#fig:cat}");
        assert_eq!(defs.len(), 1);
        assert_eq!(defs[0].id, "cat");
        assert_eq!(defs[0].number, RefNumber::Simple(1));
        assert_eq!(defs[0].caption, Some("A cat".to_string()));
        assert_eq!(defs[0].ref_type, RefType::Fig);
    }

    #[test]
    fn parse_multiple_figures() {
        let content = "![Cat](cat.png){#fig:cat}\n![Dog](dog.png){#fig:dog}";
        let defs = parse_figures(content);
        assert_eq!(defs.len(), 2);
        assert_eq!(defs[0].id, "cat");
        assert_eq!(defs[0].number, RefNumber::Simple(1));
        assert_eq!(defs[1].id, "dog");
        assert_eq!(defs[1].number, RefNumber::Simple(2));
    }

    #[test]
    fn parse_subfigure_block() {
        let content = "\
<div id=\"fig:animals\">\n\
![Cat](cat.png){#fig:cat}\n\
![Dog](dog.png){#fig:dog}\n\
Animal collection\n\
</div>";
        let defs = parse_figures(content);
        assert_eq!(defs.len(), 3);

        // Sub-figures
        assert_eq!(defs[0].id, "cat");
        assert_eq!(defs[0].number, RefNumber::SubNumbered(1, 'a'));
        assert_eq!(defs[0].caption, Some("Cat".to_string()));

        assert_eq!(defs[1].id, "dog");
        assert_eq!(defs[1].number, RefNumber::SubNumbered(1, 'b'));
        assert_eq!(defs[1].caption, Some("Dog".to_string()));

        // Main figure (emitted on </div>)
        assert_eq!(defs[2].id, "animals");
        assert_eq!(defs[2].number, RefNumber::Simple(1));
        assert_eq!(defs[2].caption, Some("Animal collection".to_string()));
    }

    #[test]
    fn parse_mixed_standalone_and_subfig() {
        let content = "\
![First](first.png){#fig:first}\n\
<div id=\"fig:group\">\n\
![A](a.png){#fig:a}\n\
![B](b.png){#fig:b}\n\
Group caption\n\
</div>\n\
![Third](third.png){#fig:third}";
        let defs = parse_figures(content);
        assert_eq!(defs.len(), 5);

        // Standalone #1
        assert_eq!(defs[0].id, "first");
        assert_eq!(defs[0].number, RefNumber::Simple(1));

        // Sub-figures of group (which is #2)
        assert_eq!(defs[1].id, "a");
        assert_eq!(defs[1].number, RefNumber::SubNumbered(2, 'a'));

        assert_eq!(defs[2].id, "b");
        assert_eq!(defs[2].number, RefNumber::SubNumbered(2, 'b'));

        // Main figure #2
        assert_eq!(defs[3].id, "group");
        assert_eq!(defs[3].number, RefNumber::Simple(2));

        // Standalone #3
        assert_eq!(defs[4].id, "third");
        assert_eq!(defs[4].number, RefNumber::Simple(3));
    }

    #[test]
    fn parse_subfig_caption_extraction() {
        let content = "\
<div id=\"fig:main\">\n\
![A](a.png){#fig:a}\n\
\n\
Some text line\n\
The actual caption\n\
</div>";
        let defs = parse_figures(content);
        let main_def = defs.iter().find(|d| d.id == "main").unwrap();
        assert_eq!(main_def.caption, Some("The actual caption".to_string()));
    }

    #[test]
    fn parse_image_without_tag_ignored() {
        let content = "![No tag](img.png)\nSome text\n![Also no tag](other.png)";
        let defs = parse_figures(content);
        assert_eq!(defs.len(), 0);
    }

    #[test]
    fn parse_figure_in_code_block_ignored() {
        let content = "```\n![A cat](cat.png){#fig:cat}\n```";
        let defs = parse_figures(content);
        assert_eq!(defs.len(), 0);
    }

    #[test]
    fn parse_empty_document() {
        let defs = parse_figures("");
        assert_eq!(defs.len(), 0);
    }

    #[test]
    fn parse_subfig_letter_sequence() {
        let content = "\
<div id=\"fig:quad\">\n\
![A](a.png){#fig:qa}\n\
![B](b.png){#fig:qb}\n\
![C](c.png){#fig:qc}\n\
![D](d.png){#fig:qd}\n\
Four images\n\
</div>";
        let defs = parse_figures(content);
        assert_eq!(defs.len(), 5);
        assert_eq!(defs[0].number, RefNumber::SubNumbered(1, 'a'));
        assert_eq!(defs[1].number, RefNumber::SubNumbered(1, 'b'));
        assert_eq!(defs[2].number, RefNumber::SubNumbered(1, 'c'));
        assert_eq!(defs[3].number, RefNumber::SubNumbered(1, 'd'));
        assert_eq!(defs[4].number, RefNumber::Simple(1));
    }

    #[test]
    fn parse_figure_with_unicode_caption() {
        let defs = parse_figures("![图片描述](img.png){#fig:zh1}");
        assert_eq!(defs.len(), 1);
        assert_eq!(defs[0].id, "zh1");
        assert_eq!(defs[0].caption, Some("图片描述".to_string()));
        assert_eq!(defs[0].number, RefNumber::Simple(1));
    }

    #[test]
    fn parse_figure_with_space_before_tag() {
        let defs = parse_figures("![Sunset](sunset.png) {#fig:sunset}");
        assert_eq!(defs.len(), 1);
        assert_eq!(defs[0].id, "sunset");
        assert_eq!(defs[0].number, RefNumber::Simple(1));
    }

    #[test]
    fn parse_figure_with_multiple_spaces_before_tag() {
        let defs = parse_figures("![Sunset](sunset.png)   {#fig:sunset}");
        assert_eq!(defs.len(), 1);
        assert_eq!(defs[0].id, "sunset");
    }

    #[test]
    fn parse_figure_with_tab_before_tag() {
        let defs = parse_figures("![Sunset](sunset.png)\t{#fig:sunset}");
        assert_eq!(defs.len(), 1);
        assert_eq!(defs[0].id, "sunset");
    }

    // --- Next-line tag tests ---

    #[test]
    fn parse_figure_next_line_tag() {
        let content = "![A sunset](sunset.png)\n{#fig:sunset}";
        let defs = parse_figures(content);
        assert_eq!(defs.len(), 1);
        assert_eq!(defs[0].id, "sunset");
        assert_eq!(defs[0].number, RefNumber::Simple(1));
        assert_eq!(defs[0].caption, Some("A sunset".to_string()));
    }

    #[test]
    fn parse_figure_next_line_tag_with_indent() {
        let content = "![A sunset](sunset.png)\n  {#fig:sunset}";
        let defs = parse_figures(content);
        assert_eq!(defs.len(), 1);
        assert_eq!(defs[0].id, "sunset");
    }

    #[test]
    fn parse_figure_next_line_blank_line_no_match() {
        // Blank line between image and tag — should NOT match
        let content = "![A sunset](sunset.png)\n\n{#fig:sunset}";
        let defs = parse_figures(content);
        assert_eq!(defs.len(), 0);
    }

    #[test]
    fn parse_figure_next_line_numbering() {
        let content = "\
![First](a.png){#fig:first}\n\
![Second](b.png)\n\
{#fig:second}\n\
![Third](c.png){#fig:third}";
        let defs = parse_figures(content);
        assert_eq!(defs.len(), 3);
        assert_eq!(defs[0].number, RefNumber::Simple(1));
        assert_eq!(defs[1].number, RefNumber::Simple(2));
        assert_eq!(defs[2].number, RefNumber::Simple(3));
    }

    #[test]
    fn parse_figure_next_line_image_without_following_tag() {
        // Image without tag, followed by non-tag text — no definition
        let content = "![No tag](img.png)\nJust regular text";
        let defs = parse_figures(content);
        assert_eq!(defs.len(), 0);
    }
}
