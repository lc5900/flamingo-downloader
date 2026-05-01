use std::collections::HashMap;

use regex::Regex;

use crate::models::{LinkCandidate, LinkParseInput, LinkParseResult};

pub fn parse_link_candidates(input: LinkParseInput) -> LinkParseResult {
    let source = input
        .source_kind
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or("text")
        .to_string();
    let base_url = input
        .source_url
        .as_deref()
        .and_then(|v| reqwest::Url::parse(v.trim()).ok());
    let mut by_key = HashMap::<String, LinkCandidate>::new();
    let mut duplicates = 0_u32;

    for raw in extract_raw_links(&input.text) {
        let Some(url) = normalize_candidate_url(&raw, base_url.as_ref()) else {
            continue;
        };
        let key = dedupe_key(&url);
        let kind = infer_candidate_kind(&url);
        if let Some(existing) = by_key.get_mut(&key) {
            existing.duplicate_count += 1;
            existing.score = existing.score.max(score_candidate(&url, &kind, true));
            duplicates += 1;
            continue;
        }
        by_key.insert(
            key,
            LinkCandidate {
                filename_hint: filename_hint(&url),
                score: score_candidate(&url, &kind, false),
                duplicate_count: 0,
                url,
                kind,
                source: source.clone(),
            },
        );
    }

    let mut candidates = by_key.into_values().collect::<Vec<_>>();
    candidates.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.url.cmp(&b.url)));
    LinkParseResult {
        candidates,
        duplicate_count: duplicates,
    }
}

fn extract_raw_links(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let attr_re = Regex::new(r#"(?i)\b(?:href|src|data-url|data-href)\s*=\s*["']([^"']+)["']"#)
        .expect("valid attr regex");
    for cap in attr_re.captures_iter(text) {
        if let Some(m) = cap.get(1) {
            out.push(html_unescape_minimal(m.as_str()));
        }
    }

    let url_re =
        Regex::new(r#"(?i)(magnet:\?[^\s"'<>]+|https?://[^\s"'<>]+)"#).expect("valid url regex");
    for m in url_re.find_iter(text) {
        out.push(html_unescape_minimal(m.as_str()));
    }
    out
}

fn normalize_candidate_url(raw: &str, base_url: Option<&reqwest::Url>) -> Option<String> {
    let mut value = raw.trim().trim_matches(['"', '\'', '`']).to_string();
    value = value
        .trim_end_matches(['.', ',', ';', ')', ']', '}'])
        .to_string();
    if value.is_empty()
        || value.starts_with('#')
        || value.to_ascii_lowercase().starts_with("javascript:")
    {
        return None;
    }
    if value.starts_with("magnet:?") {
        return Some(value);
    }
    if value.starts_with("//") {
        return Some(format!("https:{value}"));
    }
    if value.starts_with("http://") || value.starts_with("https://") {
        return reqwest::Url::parse(&value).ok().map(|u| u.to_string());
    }
    base_url.and_then(|base| base.join(&value).ok().map(|u| u.to_string()))
}

fn dedupe_key(url: &str) -> String {
    if url.starts_with("magnet:?") {
        return extract_magnet_infohash(url)
            .map(|v| format!("magnet:{v}"))
            .unwrap_or_else(|| url.to_ascii_lowercase());
    }
    reqwest::Url::parse(url)
        .map(|mut parsed| {
            parsed.set_fragment(None);
            parsed.to_string()
        })
        .unwrap_or_else(|_| url.to_string())
}

fn extract_magnet_infohash(url: &str) -> Option<String> {
    url.split('&').find_map(|part| {
        part.strip_prefix("magnet:?xt=urn:btih:")
            .or_else(|| part.strip_prefix("xt=urn:btih:"))
            .map(|v| v.to_ascii_lowercase())
    })
}

fn infer_candidate_kind(url: &str) -> String {
    if url.starts_with("magnet:?") {
        return "magnet".to_string();
    }
    if reqwest::Url::parse(url)
        .ok()
        .and_then(|u| {
            u.path_segments()
                .and_then(|mut s| s.next_back().map(str::to_string))
        })
        .map(|name| name.to_ascii_lowercase().ends_with(".torrent"))
        .unwrap_or(false)
    {
        return "torrent".to_string();
    }
    "http".to_string()
}

fn filename_hint(url: &str) -> Option<String> {
    if url.starts_with("magnet:?") {
        return None;
    }
    reqwest::Url::parse(url).ok().and_then(|u| {
        u.path_segments()
            .and_then(|mut segments| segments.next_back().map(str::to_string))
            .filter(|v| !v.is_empty())
    })
}

fn score_candidate(url: &str, kind: &str, duplicate: bool) -> u32 {
    let mut score = match kind {
        "magnet" | "torrent" => 90,
        _ => 50,
    };
    let lower = url.to_ascii_lowercase();
    if [
        ".zip", ".7z", ".rar", ".exe", ".dmg", ".pkg", ".mp4", ".mkv", ".pdf",
    ]
    .iter()
    .any(|ext| lower.contains(ext))
    {
        score += 25;
    }
    if lower.contains(".m3u8") || lower.contains(".mpd") {
        score += 20;
    }
    if duplicate {
        score += 5;
    }
    score
}

fn html_unescape_minimal(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_text_html_and_dedupes() {
        let result = parse_link_candidates(LinkParseInput {
            text: r#"
              https://example.com/file.zip
              <a href="/file.zip">same</a>
              <video src="https://cdn.example.com/movie.m3u8?token=1"></video>
              magnet:?xt=urn:btih:ABCDEF&dn=test
              magnet:?xt=urn:btih:abcdef&dn=test2
            "#
            .to_string(),
            source_url: Some("https://example.com/page".to_string()),
            source_kind: Some("html".to_string()),
        });
        assert_eq!(result.candidates.len(), 3);
        assert_eq!(result.duplicate_count, 3);
        assert!(result.candidates.iter().any(|c| c.kind == "magnet"));
        assert!(
            result
                .candidates
                .iter()
                .any(|c| c.filename_hint.as_deref() == Some("file.zip"))
        );
    }
}
