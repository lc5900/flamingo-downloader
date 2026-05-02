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
                content_type: None,
                content_length: None,
                score: score_candidate(&url, &kind, false),
                duplicate_count: 0,
                url,
                final_url: None,
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

pub fn merge_duplicate_candidates(candidates: &mut Vec<LinkCandidate>) -> u32 {
    let mut by_key = HashMap::<String, LinkCandidate>::new();
    let mut duplicate_count = 0_u32;
    for candidate in candidates.drain(..) {
        let key = enriched_dedupe_key(&candidate);
        if let Some(existing) = by_key.get_mut(&key) {
            existing.duplicate_count += 1 + candidate.duplicate_count;
            existing.score = existing.score.max(candidate.score);
            if existing.content_type.is_none() {
                existing.content_type = candidate.content_type;
            }
            if existing.content_length.is_none() {
                existing.content_length = candidate.content_length;
            }
            if existing.final_url.is_none() {
                existing.final_url = candidate.final_url;
            }
            duplicate_count += 1 + candidate.duplicate_count;
        } else {
            by_key.insert(key, candidate);
        }
    }
    candidates.extend(by_key.into_values());
    candidates.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.url.cmp(&b.url)));
    duplicate_count
}

fn enriched_dedupe_key(candidate: &LinkCandidate) -> String {
    if let (Some(name), Some(length)) = (&candidate.filename_hint, candidate.content_length)
        && length > 0
    {
        return format!("file:{}:{length}", name.to_ascii_lowercase());
    }
    if let Some(final_url) = candidate.final_url.as_deref().filter(|v| !v.is_empty()) {
        return format!("final:{}", dedupe_key(final_url));
    }
    dedupe_key(&candidate.url)
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
    let mut score: u32 = match kind {
        "magnet" | "torrent" => 90,
        _ => 50,
    };
    let lower = url.to_ascii_lowercase();
    if is_manifest_url(&lower) {
        score += 35;
    }
    if is_stream_segment_url(&lower) {
        score = score.saturating_sub(20);
    }
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
    if let Some(name) = filename_hint(url) {
        score += filename_clarity_score(&name);
    }
    if duplicate {
        score += 5;
    }
    score
}

fn is_manifest_url(lower_url: &str) -> bool {
    lower_url.contains(".m3u8") || lower_url.contains(".mpd")
}

fn is_stream_segment_url(lower_url: &str) -> bool {
    [".ts", ".m4s", ".m4a", ".aac", ".webm?"]
        .iter()
        .any(|ext| lower_url.contains(ext))
}

fn filename_clarity_score(name: &str) -> u32 {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return 0;
    }
    let lower = trimmed.to_ascii_lowercase();
    let mut score: u32 = 0;
    if lower
        .chars()
        .any(|ch| ch.is_ascii_alphabetic() || ch.is_ascii_digit())
    {
        score += 6;
    }
    if lower.contains(' ') || lower.contains('-') || lower.contains('_') {
        score += 4;
    }
    if lower.len() >= 8 {
        score += 4;
    }
    if lower.starts_with("index.") || lower.starts_with("seg-") || lower.starts_with("chunk") {
        score = score.saturating_sub(6);
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

    #[test]
    fn merges_enriched_duplicates_by_final_url_and_file_size() {
        let mut candidates = vec![
            LinkCandidate {
                url: "https://a.example/download?id=1".to_string(),
                final_url: Some("https://cdn.example/file.zip".to_string()),
                kind: "http".to_string(),
                source: "html".to_string(),
                filename_hint: Some("file.zip".to_string()),
                content_type: Some("application/zip".to_string()),
                content_length: Some(42),
                score: 90,
                duplicate_count: 0,
            },
            LinkCandidate {
                url: "https://b.example/redirect".to_string(),
                final_url: Some("https://cdn.example/file.zip".to_string()),
                kind: "http".to_string(),
                source: "html".to_string(),
                filename_hint: Some("file.zip".to_string()),
                content_type: None,
                content_length: Some(42),
                score: 70,
                duplicate_count: 0,
            },
            LinkCandidate {
                url: "https://mirror.example/file.zip".to_string(),
                final_url: None,
                kind: "http".to_string(),
                source: "html".to_string(),
                filename_hint: Some("file.zip".to_string()),
                content_type: None,
                content_length: Some(42),
                score: 60,
                duplicate_count: 0,
            },
        ];

        let duplicates = merge_duplicate_candidates(&mut candidates);
        assert_eq!(duplicates, 2);
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].duplicate_count, 2);
    }

    #[test]
    fn score_prefers_manifest_and_clear_name_over_segments() {
        let manifest =
            score_candidate("https://cdn.example.com/My Movie 1080p.m3u8", "http", false);
        let segment = score_candidate("https://cdn.example.com/seg-00001.ts", "http", false);
        assert!(manifest > segment);
    }
}
