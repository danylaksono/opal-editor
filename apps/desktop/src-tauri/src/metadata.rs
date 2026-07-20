use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::sync::OnceLock;
use tokio::time::Instant;

const CACHE_SECONDS: u64 = 30 * 24 * 60 * 60;
const USER_AGENT: &str = "Opal/1.2 (bibliography import; https://github.com/danylaksono/tectonic-editor)";
static OPEN_LIBRARY_LAST_REQUEST: OnceLock<tokio::sync::Mutex<Option<Instant>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CitationCandidate {
    pub provider: String,
    pub attribution: String,
    pub identifier: String,
    pub entry_type: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: String,
    pub journal: String,
    pub publisher: String,
    pub doi: String,
    pub isbn: String,
    pub arxiv_id: String,
    pub url: String,
    pub raw_metadata: String,
    pub from_cache: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct CacheEntry {
    cached_at: u64,
    candidate: CitationCandidate,
}

fn cache_path() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir().ok_or("Application data directory is unavailable")?;
    Ok(base.join("TectonicEditor").join("metadata-cache.json"))
}

fn read_cache() -> HashMap<String, CacheEntry> {
    cache_path().ok().and_then(|path| std::fs::read_to_string(path).ok()).and_then(|value| serde_json::from_str(&value).ok()).unwrap_or_default()
}

fn write_cache(cache: &HashMap<String, CacheEntry>) -> Result<(), String> {
    let path = cache_path()?;
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
    let value = serde_json::to_vec_pretty(cache).map_err(|error| error.to_string())?;
    std::fs::write(path, value).map_err(|error| error.to_string())
}

fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or(Duration::ZERO).as_secs() }

#[derive(Debug, Clone, PartialEq)]
enum Identifier { Doi(String), Isbn(String), Arxiv(String) }

fn normalize_identifier(value: &str) -> Result<Identifier, String> {
    let trimmed = value.trim();
    let lowered = trimmed.to_lowercase();
    let doi = lowered.trim_start_matches("https://doi.org/").trim_start_matches("http://doi.org/").trim_start_matches("doi:").trim();
    if doi.starts_with("10.") && doi.contains('/') { return Ok(Identifier::Doi(doi.to_string())); }
    let isbn: String = trimmed.chars().filter(|character| character.is_ascii_digit() || *character == 'X' || *character == 'x').collect();
    if isbn.len() == 10 || isbn.len() == 13 { return Ok(Identifier::Isbn(isbn.to_uppercase())); }
    let arxiv = lowered.trim_start_matches("https://arxiv.org/abs/").trim_start_matches("http://arxiv.org/abs/").trim_start_matches("arxiv:").trim();
    let arxiv = arxiv.rsplit_once('v').filter(|(_, version)| version.chars().all(|value| value.is_ascii_digit())).map(|(base, _)| base).unwrap_or(arxiv);
    if arxiv.contains('.') || arxiv.contains('/') { return Ok(Identifier::Arxiv(arxiv.to_string())); }
    Err("Enter a DOI, ISBN-10/13, or arXiv identifier".to_string())
}

fn cache_key(identifier: &Identifier) -> String {
    match identifier { Identifier::Doi(value) => format!("doi:{value}"), Identifier::Isbn(value) => format!("isbn:{value}"), Identifier::Arxiv(value) => format!("arxiv:{value}") }
}

fn bib_field(source: &str, name: &str) -> String {
    let lower = source.to_lowercase();
    let marker = format!("{} =", name.to_lowercase());
    let Some(start) = lower.find(&marker) else { return String::new(); };
    let value = source[start + marker.len()..].trim_start();
    let Some(open) = value.chars().next() else { return String::new(); };
    let close = if open == '{' { '}' } else if open == '"' { '"' } else { ',' };
    value[open.len_utf8()..].split(close).next().unwrap_or("").trim().to_string()
}

async fn lookup_doi(client: &reqwest::Client, doi: &str) -> Result<CitationCandidate, String> {
    let response = client.get(format!("https://doi.org/{doi}")).header("Accept", "application/x-bibtex").send().await.map_err(|error| error.to_string())?;
    if response.status().is_success() {
        let raw = response.text().await.map_err(|error| error.to_string())?;
        if raw.trim_start().starts_with('@') {
            return Ok(CitationCandidate { provider: "doi".into(), attribution: "DOI content negotiation".into(), identifier: doi.into(), entry_type: "article".into(), title: bib_field(&raw, "title"), authors: bib_field(&raw, "author").split(" and ").map(str::to_string).filter(|value| !value.is_empty()).collect(), year: bib_field(&raw, "year"), journal: bib_field(&raw, "journal"), publisher: bib_field(&raw, "publisher"), doi: doi.into(), isbn: String::new(), arxiv_id: String::new(), url: format!("https://doi.org/{doi}"), raw_metadata: raw, from_cache: false });
        }
    }
    let response = client.get(format!("https://api.crossref.org/works/{doi}")).send().await.map_err(|error| error.to_string())?;
    let raw = response.text().await.map_err(|error| error.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    let message = &json["message"];
    let authors = message["author"].as_array().map(|values| values.iter().map(|author| format!("{} {}", author["given"].as_str().unwrap_or(""), author["family"].as_str().unwrap_or("")).trim().to_string()).collect()).unwrap_or_default();
    let year = message["issued"]["date-parts"][0][0].as_i64().map(|value| value.to_string()).unwrap_or_default();
    Ok(CitationCandidate { provider: "crossref".into(), attribution: "Crossref REST API".into(), identifier: doi.into(), entry_type: message["type"].as_str().unwrap_or("article").into(), title: message["title"][0].as_str().unwrap_or("").into(), authors, year, journal: message["container-title"][0].as_str().unwrap_or("").into(), publisher: message["publisher"].as_str().unwrap_or("").into(), doi: doi.into(), isbn: String::new(), arxiv_id: String::new(), url: message["URL"].as_str().unwrap_or("").into(), raw_metadata: raw, from_cache: false })
}

fn crossref_search_candidate(item: &serde_json::Value) -> Option<CitationCandidate> {
    let doi = item["DOI"].as_str()?.trim();
    if doi.is_empty() {
        return None;
    }
    let authors = item["author"]
        .as_array()
        .map(|values| {
            values
                .iter()
                .map(|author| {
                    format!(
                        "{} {}",
                        author["given"].as_str().unwrap_or(""),
                        author["family"].as_str().unwrap_or("")
                    )
                    .trim()
                    .to_string()
                })
                .filter(|author| !author.is_empty())
                .collect()
        })
        .unwrap_or_default();
    let year = item["issued"]["date-parts"][0][0]
        .as_i64()
        .map(|value| value.to_string())
        .unwrap_or_default();
    let entry_type = match item["type"].as_str().unwrap_or("") {
        "book" | "edited-book" | "monograph" | "reference-book" => "book",
        "book-chapter" | "reference-entry" => "incollection",
        "proceedings-article" => "inproceedings",
        "dissertation" => "phdthesis",
        _ => "article",
    };
    let isbn = item["ISBN"]
        .as_array()
        .and_then(|values| values.first())
        .and_then(serde_json::Value::as_str)
        .unwrap_or("")
        .to_string();

    Some(CitationCandidate {
        provider: "crossref-search".into(),
        attribution: "Crossref REST API".into(),
        identifier: doi.to_string(),
        entry_type: entry_type.into(),
        title: item["title"][0].as_str().unwrap_or("").into(),
        authors,
        year,
        journal: item["container-title"][0].as_str().unwrap_or("").into(),
        publisher: item["publisher"].as_str().unwrap_or("").into(),
        doi: doi.to_string(),
        isbn,
        arxiv_id: String::new(),
        url: item["URL"].as_str().unwrap_or("").into(),
        raw_metadata: serde_json::to_string(item).unwrap_or_default(),
        from_cache: false,
    })
}

#[tauri::command]
pub async fn search_references(
    query: String,
    limit: Option<u8>,
) -> Result<Vec<CitationCandidate>, String> {
    let query = query.trim();
    if query.len() < 3 {
        return Err("Enter at least three characters to search for a reference".to_string());
    }
    if query.len() > 500 {
        return Err("Reference search query is too long".to_string());
    }
    let rows = limit.unwrap_or(5).clamp(1, 10).to_string();
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get("https://api.crossref.org/works")
        .query(&[
            ("query.bibliographic", query),
            ("rows", rows.as_str()),
            (
                "select",
                "DOI,type,title,author,issued,container-title,publisher,ISBN,URL",
            ),
        ])
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Crossref search returned HTTP {}",
            response.status()
        ));
    }
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|error| error.to_string())?;
    Ok(json["message"]["items"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(crossref_search_candidate)
        .collect())
}

async fn lookup_isbn(client: &reqwest::Client, isbn: &str) -> Result<CitationCandidate, String> {
    let limiter = OPEN_LIBRARY_LAST_REQUEST.get_or_init(|| tokio::sync::Mutex::new(None));
    let mut last = limiter.lock().await;
    if let Some(previous) = *last {
        let elapsed = previous.elapsed();
        if elapsed < Duration::from_secs(1) { tokio::time::sleep(Duration::from_secs(1) - elapsed).await; }
    }
    *last = Some(Instant::now());
    drop(last);
    let response = client.get(format!("https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&jscmd=data&format=json")).send().await.map_err(|error| error.to_string())?;
    let raw = response.text().await.map_err(|error| error.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    let book = &json[format!("ISBN:{isbn}")];
    if book.is_null() { return Err("Open Library did not return a matching edition".to_string()); }
    let authors = book["authors"].as_array().map(|values| values.iter().filter_map(|author| author["name"].as_str().map(str::to_string)).collect()).unwrap_or_default();
    let year = book["publish_date"].as_str().and_then(|value| value.split(|character: char| !character.is_ascii_digit()).find(|part| part.len() == 4)).unwrap_or("").to_string();
    Ok(CitationCandidate { provider: "open-library".into(), attribution: "Open Library ISBN API".into(), identifier: isbn.into(), entry_type: "book".into(), title: book["title"].as_str().unwrap_or("").into(), authors, year, journal: String::new(), publisher: book["publishers"][0]["name"].as_str().unwrap_or("").into(), doi: String::new(), isbn: isbn.into(), arxiv_id: String::new(), url: book["url"].as_str().unwrap_or("").into(), raw_metadata: raw, from_cache: false })
}

fn xml_text(source: &str, tag: &str) -> String {
    let open = format!("<{tag}>"); let close = format!("</{tag}>");
    source.find(&open).and_then(|start| source[start + open.len()..].find(&close).map(|end| source[start + open.len()..start + open.len() + end].trim().replace(['\n', '\r'], " "))).unwrap_or_default()
}

async fn lookup_arxiv(client: &reqwest::Client, arxiv: &str) -> Result<CitationCandidate, String> {
    let response = client.get(format!("https://export.arxiv.org/api/query?id_list={arxiv}")).send().await.map_err(|error| error.to_string())?;
    let raw = response.text().await.map_err(|error| error.to_string())?;
    let entry = raw.split("<entry>").nth(1).and_then(|value| value.split("</entry>").next()).ok_or("arXiv did not return a matching record")?;
    let authors = entry.split("<author>").skip(1).map(|value| xml_text(value, "name")).filter(|value| !value.is_empty()).collect();
    let published = xml_text(entry, "published");
    Ok(CitationCandidate { provider: "arxiv".into(), attribution: "arXiv API; data provided by arXiv".into(), identifier: arxiv.into(), entry_type: "article".into(), title: xml_text(entry, "title"), authors, year: published.get(0..4).unwrap_or("").into(), journal: "arXiv preprint".into(), publisher: String::new(), doi: xml_text(entry, "arxiv:doi"), isbn: String::new(), arxiv_id: arxiv.into(), url: format!("https://arxiv.org/abs/{arxiv}"), raw_metadata: raw, from_cache: false })
}

#[tauri::command]
pub async fn lookup_reference(identifier: String, refresh: Option<bool>) -> Result<CitationCandidate, String> {
    let normalized = normalize_identifier(&identifier)?;
    let key = cache_key(&normalized);
    let mut cache = read_cache();
    if !refresh.unwrap_or(false) {
        if let Some(entry) = cache.get(&key) {
            if now().saturating_sub(entry.cached_at) < CACHE_SECONDS { let mut candidate = entry.candidate.clone(); candidate.from_cache = true; return Ok(candidate); }
        }
    }
    let client = reqwest::Client::builder().user_agent(USER_AGENT).timeout(Duration::from_secs(15)).build().map_err(|error| error.to_string())?;
    let candidate = match &normalized { Identifier::Doi(value) => lookup_doi(&client, value).await?, Identifier::Isbn(value) => lookup_isbn(&client, value).await?, Identifier::Arxiv(value) => lookup_arxiv(&client, value).await? };
    cache.insert(key, CacheEntry { cached_at: now(), candidate: candidate.clone() });
    write_cache(&cache)?;
    Ok(candidate)
}

#[tauri::command]
pub fn clear_metadata_cache() -> Result<(), String> {
    let path = cache_path()?;
    if path.exists() { std::fs::remove_file(path).map_err(|error| error.to_string())?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn normalizes_supported_identifiers() {
        assert_eq!(normalize_identifier("https://doi.org/10.1000/ABC").unwrap(), Identifier::Doi("10.1000/abc".into()));
        assert_eq!(normalize_identifier("978-0-306-40615-7").unwrap(), Identifier::Isbn("9780306406157".into()));
        assert_eq!(normalize_identifier("arXiv:2401.12345v2").unwrap(), Identifier::Arxiv("2401.12345".into()));
    }
    #[test] fn parses_bibtex_fields() { assert_eq!(bib_field("@article{x, title = {Hello World}}", "title"), "Hello World"); }
    #[test]
    fn maps_crossref_search_results() {
        let item = serde_json::json!({
            "DOI": "10.1000/example",
            "type": "proceedings-article",
            "title": ["A useful result"],
            "author": [{ "given": "Jane", "family": "Smith" }],
            "issued": { "date-parts": [[2024]] },
            "container-title": ["Proceedings"],
            "publisher": "Example Press",
            "URL": "https://doi.org/10.1000/example"
        });
        let candidate = crossref_search_candidate(&item).unwrap();
        assert_eq!(candidate.doi, "10.1000/example");
        assert_eq!(candidate.entry_type, "inproceedings");
        assert_eq!(candidate.authors, vec!["Jane Smith"]);
        assert_eq!(candidate.year, "2024");
    }
    #[test] fn cache_expiry_is_thirty_days() { assert!(CACHE_SECONDS == 2_592_000); }
}
